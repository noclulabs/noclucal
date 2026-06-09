# CALENDAR-PLAYBOOK.md

> Reference layer for noCluCal, not a bible file. This holds the deep design
> rationale for the booking core (calendar integration, slot computation, event
> types, availability) that used to live inline in CLAUDE.md. It is read on
> demand, not loaded into every session. CLAUDE.md keeps a short summary plus a
> pointer to the relevant section here.
>
> Split this file by durable domain (scheduling, calendar, auth), never by
> phase. When a section here is contradicted by code, the code wins; update this
> file in the same PR.

## Calendar abstraction layer (deep detail)

The architecture contract (the `CalendarProvider` interface, stateless
providers, the `registerProvider` / `register-all.ts` wiring, and the deferred
webhook extension interface) lives in CLAUDE.md § Calendar abstraction layer.
The deep rationale for the concrete pieces is below.

### Token encryption

`src/lib/calendar/crypto.ts` provides `encryptToken(plaintext): string` and
`decryptToken(ciphertext): string`. Algorithm: AES-256-GCM via Node's built-in
`node:crypto`. No external dependencies.

Ciphertext format is `v1:base64nonce:base64ciphertext`. The version prefix is
load-bearing: a future `v2:` would indicate ciphertext produced by a different
key, enabling key rotation without a schema change (the decrypt path dispatches
on the version to find the right key). Each encryption uses a fresh random
12-byte nonce, so the same plaintext encrypts to a different output every time.

The key is sourced from `process.env.TOKEN_ENCRYPTION_KEY` (base64-encoded 32
bytes) and loaded lazily on first encrypt/decrypt call. Lazy loading is
deliberate: Next.js's build-time module collection imports this file without
the env var being set, and we do not want the build to crash. Misconfigured
deployments surface a clear error on first use.

Tests in `tests/lib/calendar/crypto.test.ts` set their own key in `beforeEach`
and restore in `afterEach`, so test outcomes are independent of whatever is in
`.env.local`.

Decryption failures (tampering, wrong key, malformed format) all throw. Route
code that catches a decryption error should treat the connection as broken,
delete the row, and prompt the user to reconnect. The crypto module itself
never logs key material or partial ciphertext.

### Google Calendar provider

`src/lib/calendar/providers/google.ts` exports `googleCalendarProvider`, an
implementation of `CalendarProvider` over the official `googleapis` SDK.
Stateless: tokens are method arguments. Client credentials (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`) are loaded lazily from `process.env`, matching the
pattern in `crypto.ts`. Module import has no side effects.

OAuth scope list (final, four entries): `openid`, `email`,
`https://www.googleapis.com/auth/calendar.events`,
`https://www.googleapis.com/auth/calendar.readonly`. The `openid` and `email`
scopes are required for Google to return an `id_token` with the `sub` and
`email` claims that populate `externalAccountId` and `externalAccountEmail`.

The authorization URL passes `access_type: "offline"` so Google returns a
refresh token, and `prompt: "consent"` so the consent screen always shows
(otherwise Google omits the refresh token on re-auth, silently breaking the
reconnect flow).

`exchangeCode` verifies the id_token via `OAuth2.verifyIdToken` (signature,
audience, issuer, expiry checked against Google's public keys) before
extracting `sub` and `email`. Parsing without verification would let a MitM
with a fake id_token spoof account identity, and we do not skip this even
though TLS makes the attack unlikely.

`email_verified` is intentionally NOT enforced. Most Google accounts are
verified, but rejecting unverified emails would create unhelpful failures
for otherwise-valid connections. The email is display-only in our system.

`refreshAccessToken` preserves the caller's refresh token if Google does not
rotate it (Google sometimes returns a new refresh_token on refresh, sometimes
does not; the interface requires `refreshToken` always be populated).

`revoke` targets the refresh token via `OAuth2.revokeToken`. Revoking the
refresh token also invalidates all access tokens issued from it.

`createEvent` opts into Google Meet via `withConference: true`. The request
includes `conferenceData.createRequest` with a fresh UUID `requestId` and
`conferenceSolutionKey.type: "hangoutsMeet"`, and the API call passes
`conferenceDataVersion: 1`. Without `withConference`, no conferencing payload
is sent.

`src/lib/calendar/providers/register-all.ts` is a side-effecting wiring module
that imports the Google provider and calls `registerProvider`. Server entry
points (Phase 2d's OAuth callback route is the first) import this file once
at startup, before any code path that calls `getProvider`. Phase 2c ships the
file but does not yet import it from production code; the dedicated test
verifies the registration works.

### Calendar connection flow

The full OAuth connect / callback / disconnect flow is wired in
`src/app/api/calendar/google/connect/route.ts`,
`src/app/api/calendar/google/callback/route.ts`, and
`src/app/settings/calendars/actions.ts` (the disconnect server action).
The settings page at `src/app/settings/calendars/page.tsx` is a server
component that reads the session, looks up the user's Google connection,
and renders connect-or-disconnect UI accordingly.

**CSRF protection via cookie-based state.** The connect route generates
a 32-byte random `state`, sets it as a `__Host-noclucal-oauth-state`
cookie (or `noclucal-oauth-state` in dev), and passes the same value as
the OAuth `state` parameter. The callback route compares the query
`state` to the cookie value with `crypto.timingSafeEqual`. Mismatch
redirects to the settings page with `?error=state_mismatch`. SameSite
is `lax` (not `strict`) so the cookie survives the cross-site top-level
navigation from Google back to our domain.

**Transactional connection upsert.** On successful callback, the
`replaceConnection` helper in `src/lib/calendar/connections.ts` runs a
DELETE then INSERT inside `db.transaction`. The unique-per-(user,
provider) index would otherwise conflict on reconnect; the
delete-then-insert pattern handles reconnect cleanly without resorting
to ON CONFLICT logic that would need to update token columns.

**Disconnect is best-effort revoke plus unconditional local delete.**
The disconnect server action calls `provider.revoke(refreshToken)`. If
revoke throws (token already revoked at Google, network error), the
error is logged and the local connection row is still deleted, so the
user sees a successful disconnect in our UI. The next OAuth flow will
re-grant access cleanly.

**Refresh wrapper with 60-second safety margin.**
`getValidTokensForConnection(connectionId)` in
`src/lib/calendar/connections.ts` returns valid decrypted tokens. If
the stored access token is within 60 seconds of expiry (or already
expired), it calls `provider.refreshAccessToken`, persists the new
token set, and returns the fresh tokens. On refresh failure (Google
rejects the refresh token, typically because the user revoked our
access in their Google account settings), the connection row is
deleted and a `RefreshFailedError` is thrown. Callers should catch
this error and route the user to a reconnect-required UX.

**Auth gates.** The `proxy.ts` matcher protects `/settings/*` and
`/api/calendar/google/connect`. The callback route is NOT in the
matcher; it handles its own auth check. Bouncing through noclulabs
signin from the callback would lose the single-use OAuth `code`, so
the callback redirects unauthenticated requests to
`/settings/calendars?error=session_lost` instead.

**Redirect URI is environment-gated.** In production
(`AUTH_URL.startsWith("https://")`), the redirect URI is
`https://cal.noclulabs.com/api/calendar/google/callback`. In dev, it is
`http://localhost:3000/api/calendar/google/callback`. The same value
must be passed to both `buildAuthorizationUrl` (connect route) and
`exchangeCode` (callback route); Google rejects token exchange if the
redirect URIs do not match. Both URIs are registered in Google Cloud
Console at OAuth client provisioning time.

**Redirect URLs are derived from `AUTH_URL`, not `request.url`.** Inside
the Docker container behind Caddy, `request.url` resolves to the
internal bind address (`http://0.0.0.0:3000`), not the public host.
`getAppOrigin()` in `src/lib/app-url.ts` returns the public origin (from
`AUTH_URL`, trailing slashes stripped, localhost fallback). The callback
route uses this helper for the success redirect and all five error
redirects. Future route handlers that build redirect URLs back into the
app should use the same helper rather than `request.url`.

## Event types and availability storage (Phase 3a rationale)

Phase 3a ships the storage shape for the booking core. No business logic,
no UI, no input validation: those are Phase 3b (slot computation) and 3c
(settings UI). The reasoning below is recorded so 3b and 3c inherit it.
The table definitions themselves live in CLAUDE.md § Database / Schema.

### Storage-only scope

3a is tables, the schema barrel, the migration, and integration tests.
There are no Zod validators, no server actions, no slot logic, and no
pages in this phase. Anything that validates input (slug shape, reserved
words, timezone validity, color membership) lands in 3c. Anything that
computes bookable slots lands in 3b.

### Per-user single availability schedule

The MVP runs one availability schedule per host, shared by every event
type. Availability rows key on `user_id` directly; there is no FK from
availability to `event_types` and no `schedule_id` column. Multi-schedule
is a future additive migration (add a `schedules` table, add a nullable
`schedule_id` to the availability tables, backfill a default schedule).
Do not retrofit a `schedule_id` until that work is scoped.

### Normalized availability model

`availability_rules` holds recurring weekly windows; `availability_overrides`
holds date-specific exceptions. Both allow multiple rows per key
(`(user_id, weekday)` and `(user_id, date)` respectively) so split days are
first-class (for example 09:00 to 12:00 and 13:00 to 17:00 on one weekday,
or a half-day custom override). There is deliberately no unique constraint
on either pair. The override shape CHECK keeps the blocked and custom-hours
modes mutually exclusive and well-formed.

### ISO weekday and wall-clock time

`weekday` is ISO 1 to 7 (Monday=1, Sunday=7) to match Luxon's
`DateTime.weekday`, removing conversion friction in 3b. A CHECK constraint
enforces the range. Times are Postgres `time` (wall-clock, no timezone) and
are interpreted in the host's timezone, which resolves from `host_settings`.
UTC conversion happens in 3b's slot computation, never in storage.

### Integer minutes, not intervals

Every duration (`duration_minutes`, the two buffers, `min_notice_minutes`,
`max_future_minutes`, `slot_granularity_minutes`) is an integer count of
minutes, not a Postgres `interval`. Slot math in 3b works in a single unit
without parsing interval types.

### Color as an app-validated token

Event type `color` is a `varchar(32)` holding a named palette token (for
example `indigo`), not a pg enum and with no DB CHECK. The single source of
truth is `EVENT_TYPE_COLORS` in `src/lib/event-types/colors.ts`; the schema
default and 3c's Zod validator both read from there. Storing the token as a
plain varchar keeps the palette evolvable: adding a swatch is a code change
with no migration. `EVENT_TYPE_COLOR_HEX` in the same module maps each token
to a display hex tuned for the dark canvas; the swatch UI in 3c consumes it.

### host_settings preserves the shadow-table invariant

`noclucal_users` is a pure projection of noclulabs identity and must stay
that way. Host-owned scheduling config (currently just the booking
timezone) therefore lives on the noCluCal-owned `host_settings` table, keyed
1:1 on `user_id`, rather than as columns on the shadow table. New host
preferences added later belong here, not on `noclucal_users`.

## Slot computation (Phase 3b)

Phase 3b ships the algorithmic core of the booking tool: `computeSlots` at
`src/lib/scheduling/compute-slots.ts`, plus the numeric interval helpers at
`src/lib/scheduling/intervals.ts` and the scheduling types at
`src/lib/scheduling/types.ts`. It is the first use of Luxon in the codebase.
Like the Google provider in Phase 2c, the engine ships implemented and
exhaustively tested but is not yet wired into a route or page; the settings
UI (3c) is its first consumer.

### Purity and injection

`computeSlots` is pure and deterministic. Every input is an argument: the
reference instant `now`, the requested `rangeStart` / `rangeEnd`, the host
timezone, the availability rules and overrides, the event type config, and
the busy intervals. There is no system clock read, no DB access, and no
network. Busy times are injected (mirroring `CalendarProvider.getFreeBusy`'s
`{ start, end }` shape) rather than fetched, which is what makes the DST and
edge-case matrix fully testable offline. The orchestration that actually
reads Google freebusy and persists holds is a later phase.

### Invitee timezone is not an input

Slots are timezone-agnostic UTC instants. The invitee's timezone only
affects how slots are grouped and rendered, which is a UI concern (3c and
Phase 4). This is a deliberate deviation from the rough signature sketched
in the onboarding doc, which listed invitee timezone as a parameter. Keeping
it out of the engine means one set of instants serves every viewer and the
function has no presentation responsibility.

### Replace-with-block-wins override composition

If a date has any override row, the recurring weekly rules are ignored for
that date (replace, not merge). If any override row for that date is a
full-day block (`isAvailable` false), the whole date is unavailable
regardless of the other rows (block wins). Otherwise the date's windows are
the union of the `isAvailable` true override windows. This matches the
storage model from 3a, where multiple override rows per date are allowed for
split custom days and a block row carries null times.

### Buffer overlap rule

A slot is valid only if its guarded interval
`[start - bufferBefore, end + bufferAfter]` (real time) overlaps no busy
interval. Overlap is half-open: touching at a boundary is not an overlap, so
a slot ending exactly when a busy block starts is still bookable. Buffers
block against any busy interval, not just the target calendar's own events.

### Wall-clock stepping, nominal fit, real-time end

Slots step by granularity from each availability window's start in
wall-clock minutes, and a candidate is kept only if it fits fully inside the
window by nominal duration (`candidateStartMinutes + durationMinutes <=
windowEndMinutes`). Wall-clock stepping keeps the slot grid aligned to local
time across a DST transition. The slot end instant, by contrast, is real
time: `start instant + durationMinutes` of real milliseconds, so a meeting
spanning a DST transition is still its nominal number of real minutes. The
two uses of duration (nominal minutes for the fit check, real time for the
end instant) are intentional and distinct.

### DST policy

The load-bearing conversion is `wallClockToInstant`, which builds a Luxon
`DateTime` from the local date and minute-of-day in the host zone and
confirms the local fields round-trip. Spring-forward nonexistent wall-clock
times (Luxon forward-shifts them, so the hour or minute no longer matches)
return null and are dropped. Fall-back ambiguous times resolve to Luxon's
default offset and, because each wall-clock minute is converted exactly once,
are offered once rather than twice. Day iteration uses Luxon's
`plus({ days: 1 })`, which is DST-aware (it lands on the next local midnight
regardless of a 23 or 25 hour day).

### min-notice and max-future clamp on the slot start

The effective window is
`[max(rangeStart, now + minNotice), min(rangeEnd, now + maxFutureMinutes)]`.
A slot is kept if its start is at or after the effective start and strictly
before the effective end (the clamp is on the slot start, not its end). If
`rangeStart >= rangeEnd` or the effective window is empty, the result is the
empty array.

## Event type management (Phase 3c)

Phase 3c ships the event types vertical slice: the Zod validation module at
`src/lib/event-types/validation.ts`, the data-access layer at
`src/lib/event-types/queries.ts`, the `/settings/event-types` list, `new`,
and `[id]` edit routes, the `EventTypeForm` client component, and the
create/update/delete server actions at
`src/app/settings/event-types/actions.ts`. It is the first user-facing
booking feature and the first use of Zod in the codebase. Availability and
timezone management is 3d; a live slot preview is a later optional sub-phase.

### Per-user authz scoping

Authz is server-side and per-user. Every data-access function in
`queries.ts` takes a `userId` and scopes every query to it: `getEventType`,
`updateEventType`, and `deleteEventType` all filter on both `userId` and
`id`, so a user can never read, update, or delete another user's event type
by guessing its id (the read returns null, the update returns null, the
delete returns false). The server actions resolve `userId` from `auth()` on
the server and never trust a client-supplied id; the only client-supplied id
is the event type's own `id` on the edit and delete forms, which is always
re-scoped to the session user before it touches the database.

### Slug rules and unique-violation mapping

Slugs are lowercase kebab-case, validated by the `SLUG_PATTERN` regex and a
small `RESERVED_SLUGS` list (`new`, `edit`, `api`) in the Zod schema.
Uniqueness is per-user, enforced by the existing
`event_types_user_slug_unique` index on `(user_id, slug)`. `createEventType`
and `updateEventType` wrap the write in a try/catch and map the Postgres
unique violation (SQLSTATE `23505`) to a `SlugConflictError`, which the
actions catch and surface as a friendly field error on the slug input,
never a 500. drizzle-orm wraps the failing query so the `23505` code lives
on the error's `cause`; `isUniqueViolation` walks the cause chain to find
it. The form also suggests a slug from the name via `slugify` until the user
edits the slug field directly, but that is a client convenience; the schema
validates whatever is finally submitted.

### Server-side re-validation contract

The form is a client component (for slug auto-suggest and swatch selection),
but client validation is never the gate. Every server action re-parses the
submitted `FormData` with the same `eventTypeInputSchema` via `safeParse`. On
failure the action returns `{ errors, values }` (first Zod issue per field
plus the stringified inputs so the form repopulates); on success it
revalidates `/settings/event-types` and redirects to the list.

### Checkbox-to-boolean handling

The enabled toggle posts the literal string `"true"` or `"false"` through a
controlled hidden input, and the action reads
`formData.get("enabled") === "true"`. This is deliberate: a raw HTML checkbox
posts nothing when unchecked, so `z.coerce.boolean` against a checkbox value
would misread the disabled state. The color swatch picker posts the selected
palette token (for example `indigo`) through a controlled hidden input,
validated with `z.enum(EVENT_TYPE_COLORS)`; the swatches render from
`EVENT_TYPE_COLOR_HEX`.

## Availability and timezone management (Phase 3d / 3e)

Phase 3d ships the availability vertical slice: the Zod validation module at
`src/lib/availability/validation.ts`, the data-access layer at
`src/lib/availability/queries.ts`, the `/settings/availability` page, the
Calendly-style weekly editor and the timezone picker client components, and
the two save server actions at `src/app/settings/availability/actions.ts`.
Phase 3e adds date overrides to the same files (the override schema, the
override data-access, the override actions, and a new `overrides-editor.tsx`)
plus a third section on the page. A live slot preview is a later optional
sub-phase. Nothing here imports `computeSlots`; the override composition logic
already lives in `computeSlots` from 3b (replace-with-block-wins), and 3e only
ships the data and UI to populate the `availability_overrides` table.

### Transactional weekly-replace save model

The whole week saves at once. `replaceAvailabilityRulesForUser` deletes the
user's existing `availability_rules` and inserts the submitted set inside one
`db.transaction`, mirroring the Phase 2 `replaceConnection` pattern and
avoiding per-row diffing. An empty submission (all days unavailable) is valid
and clears all rules (the delete runs, the insert is skipped). The dynamic
set of ranges travels from the editor to the action as a single JSON string
in the `schedule` form field; the action `JSON.parse`s it then re-validates
with `weeklyScheduleSchema`. Indexed form fields are deliberately not used for
the variable number of ranges.

### `"HH:MM"` end to end, seconds truncated on read

Times are wall-clock `"HH:MM"` from the editor's native `input type="time"`
fields all the way to validation, which checks the format with a 24-hour
regex. The Postgres `time` column returns `"HH:MM:SS"`, so the page truncates
to `"HH:MM"` (a `slice(0, 5)`) when seeding the editor. Because zero-padded
24-hour `"HH:MM"` strings sort lexicographically in the same order as the
times they denote, the end-after-start refine compares the two strings
directly rather than parsing them.

### Timezone source and server-side validation

The timezone is one IANA value per user, stored in `host_settings` and
upserted via `ON CONFLICT (user_id) DO UPDATE`. The picker is populated
client-side from `Intl.supportedValuesOf("timeZone")` (with the current value
guaranteed present even if the runtime list omits it), but that list is
convenience only: the server re-validates the submitted value with Luxon's
`IANAZone.isValidZone` in `saveTimezoneAction` and never trusts the client's
list. When no `host_settings` row exists yet, the page defaults the picker to
`America/Los_Angeles`, mirroring the column default.

### Independent timezone and schedule saves

Timezone and weekly schedule are two sections with two separate actions
(`saveTimezoneAction` and `saveWeeklyScheduleAction`), so a user can change
one without re-saving the other. Both actions resolve `userId` from `auth()`,
re-validate with the same Zod schemas the client uses, and return a small
`{ ok?, error? }` state for the `useActionState` form to render a saved
confirmation or an error. Authz is server-side and per-user; client-side
checks (each range's end after its start, disabling save while a range is
malformed) are friendlier feedback ahead of the server gate, never the gate
itself.

### Date-keyed override model (Phase 3e)

An override is keyed by date, not by row. A date is either blocked (a holiday:
one `availability_overrides` row, `is_available` false, null times) or has
custom hours that replace the recurring rules for that day (one or more rows,
`is_available` true, with times). The UI and `dateOverrideInputSchema` speak in
terms of a date carrying a `blocked` flag and a `ranges` array; the data-access
expands that input into the right rows. The page reads the flat rows back and
groups them by date into a `{ date, blocked, ranges }` display shape (a date is
blocked when it has an `is_available` false row, otherwise its ranges are the
`is_available` true rows' times truncated to `"HH:MM"`).

This composes with the replace-with-block-wins model `computeSlots` already
implements from 3b: any override row for a date replaces the recurring rules
for that date, and a block row makes the whole date unavailable. 3e does not
import the engine; it only writes the rows the engine reads.

### Block-versus-custom exclusivity drives the shape CHECK

`dateOverrideInputSchema`'s final refine makes the two modes mutually
exclusive: a blocked day requires an empty `ranges`, an available day requires
at least one range (each with its end after its start). Because the input can
only be a well-formed block or a well-formed set of custom ranges, the rows
`setDateOverrideForUser` produces always satisfy the `availability_overrides`
shape CHECK from 3a (a blocked row is `is_available` false with null times; a
custom row is `is_available` true with non-null times and start < end). The
date is gated by a `"YYYY-MM-DD"` regex plus a Luxon `DateTime.fromISO`
validity refine, so an impossible date that still matches the shape (for
example `2026-13-40`) is rejected before it reaches the database.

### Per-date transactional replace

`setDateOverrideForUser` is the per-date analogue of the weekly replace: inside
one `db.transaction` it deletes the user's existing rows for that single date,
then inserts the new row (blocked) or rows (one per range). Editing a date is
just setting it again; there is no per-row diffing. `deleteDateOverrideForUser`
removes every row for a date and returns a boolean. The override travels from
the editor to `setDateOverrideAction` as one JSON string in the `override` form
field (the same single-JSON-field pattern the weekly schedule uses), parsed and
re-validated with `dateOverrideInputSchema` on the server; the delete action
format-checks the date field. Every override query is scoped by `userId`, so
one user can never read, replace, or delete another user's overrides.

## Booking model (Phase 4a)

Phase 4a ships the booking data layer: the `bookings` table, the Postgres
exclusion constraint that makes overlapping confirmed bookings for a host
physically impossible, and the booking data-access at
`src/lib/bookings/queries.ts`. Like the slot engine in 3b, it ships
implemented and tested but is not yet wired to a runtime path; the public
booking flow (4b through 4e) is the first consumer. There is no Zod here;
invitee input validation lands in 4d, where untrusted input enters the
system. The table definition itself lives in CLAUDE.md § Database / Schema.

### Bookings are an immutable historical record

A confirmed booking is a fact about something that happened, not a live view
of current configuration. It therefore snapshots the fields it needs to be
self-describing: `event_type_name` and `duration_minutes` are copied in at
booking time rather than read back through the FK. The host can rename an
event type, change its duration, or delete it outright, and existing booking
history is untouched. This is the same instinct as an invoice line item
storing the price it was sold at, not joining to today's price list.

### `ON DELETE SET NULL` on the event type FK

`event_type_id` is a nullable FK to `event_types` with `ON DELETE SET NULL`,
not `CASCADE` and not `RESTRICT`. Cascade would destroy booking history when
a host tidies up their event types, which is exactly the data loss the
snapshot design exists to prevent. Restrict would block a host from deleting
an event type that has ever been booked, which is a hostile constraint on a
routine action. Set-null keeps the booking, keeps its snapshot, and simply
drops the now-meaningless pointer. A booking with a null `event_type_id` is
fully described by its snapshot columns.

### Per-host exclusion constraint as the hard floor

Double-booking is prevented at the database level by
`bookings_no_overlap_per_host`, an `EXCLUDE USING gist` constraint added by
hand in migration 0003:

```sql
EXCLUDE USING gist (
  host_user_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status = 'confirmed')
```

It reads: there may not exist two rows with the same `host_user_id` whose
`[starts_at, ends_at)` ranges overlap, considering only `confirmed` rows. The
gist operator class for the equality term needs the `btree_gist` extension,
created at the top of the migration the same way `citext` was prepended in
0000. Drizzle does not model `EXCLUDE` constraints, so the schema file does
not declare it and a re-run of `pnpm db:generate` after the migration applies
sees nothing to change (confirmed: no drop is emitted). The constraint is
hand-managed; never let `db:generate` drop it.

Three design points are load-bearing:

- **Half-open ranges.** `tstzrange(starts_at, ends_at)` is `[)` by default, so
  a booking ending exactly when another starts does not overlap. This matches
  the half-open convention used throughout slot computation (the buffer
  overlap rule in 3b is also half-open), so the floor and the engine agree on
  what "back to back" means: allowed.
- **The guard is per host, not per event type.** A host cannot be in two
  meetings at once regardless of which event types they are for, so the
  constraint keys on `host_user_id`. Two different hosts may hold overlapping
  bookings freely.
- **Partial on `status = 'confirmed'`.** Only confirmed bookings reserve time.
  A cancelled booking is excluded from the index, so it neither conflicts with
  nor blocks a new confirmed booking in the same window. This is what lets the
  table retain cancelled rows as history without them poisoning availability.

### Status lifecycle

`status` is a `varchar(20)` with app-level values (`confirmed`, `cancelled`),
not a pg enum, consistent with the color-as-token decision in 3a: the
lifecycle evolves without a migration. The constants live at
`src/lib/bookings/constants.ts` (`BOOKING_STATUSES`, `BookingStatus`,
`DEFAULT_BOOKING_STATUS`). Held holds are deliberately not rows: a pending
hold lives in Redis with a short TTL (4b), so the table only ever carries
`confirmed` and, once cancellation ships, `cancelled` bookings. A new booking
is always written `confirmed` by `createBooking`.

### Where this sits in the layered double-booking defense

Preventing two invitees from grabbing the same slot is defended at four
layers, outermost to innermost:

1. **Live freebusy read plus internal-booking union (4b).** `getAvailableSlots`
   injects the host's busy intervals (live Google freebusy unioned with the
   host's own confirmed bookings) so an already-busy time is never offered.
   This is a filter, not a guarantee: it races.
2. **Redis slot hold (deferred).** A short-lived hold so two invitees in the
   same few seconds do not both reach the confirm step would narrow the race
   further, but holds expire and Redis can be flushed, so it was never the
   floor. Deferred out of the committed Phase 4 plan (see ROADMAP § Deferred
   items); the freebusy-plus-union filter above and the constraint below stand
   without it.
3. **This exclusion constraint (4a).** The hard floor. Even if every layer
   above races or is bypassed, the database physically refuses the second
   overlapping confirmed insert. `createBooking` catches the `23P01` exclusion
   violation (via the same drizzle `.cause`-chain walk that
   `event-types/queries.ts` uses for `23505`) and throws `BookingConflictError`,
   which the confirm flow surfaces as "pick another slot" rather than a 500.
4. **Google calendar write-back (4d).** The event is created on the host's
   calendar, so other tools reading that calendar see the time as taken.

The layers above the floor are optimizations that keep the floor from being
hit in normal operation; the floor is the only one that cannot be raced. 4a
ships the floor first, on purpose, so everything built on top of it inherits
a correctness guarantee it cannot undermine.

### Host-scoped data-access

`createBooking`, `listBookingsForHost`, and `getBooking` mirror the per-user
scoping of `event-types/queries.ts`: `getBooking` filters on both
`hostUserId` and `id`, so a host cannot read another host's booking by
guessing its id, and `listBookingsForHost` filters on `hostUserId` and orders
by `starts_at` ascending. `createBooking` takes a typed `CreateBookingInput`
(host, the nullable event type id, the name and duration snapshot, invitee
fields, the invitee timezone for display, and the start and end instants) and
returns the inserted row.

## Available-slots orchestration (Phase 4b)

Phase 4b ships `getAvailableSlots` at `src/lib/booking/available-slots.ts`, the
first runtime consumer of the pure `computeSlots` engine. Where the engine (3b)
is pure and takes injected busy intervals, the orchestration does the real I/O:
it loads the event type, the host timezone, the availability rules and
overrides, reads the host's confirmed bookings, fetches live Google freebusy,
and hands the engine the busy set. It is read-only: no booking is written (that
is 4d), and it does not resolve a public `username` / event-type `slug` to ids
(that is 4c). Like the engine and the booking data layer before it, it ships
implemented and tested but is not yet wired to a page.

### Busy is the union of external and internal

The engine's `busy` input is `external ∪ internal`. External busy is the host's
live Google freebusy for the window. Internal busy is the host's own
`confirmed` bookings overlapping the window, read straight from the `bookings`
table via `listConfirmedBookingsInWindow`.

Reading internal bookings directly, rather than relying on the Google
write-back to show them as busy, closes a propagation-lag gap: when a booking is
confirmed (4d), the Google event is created on the host's calendar, but that
event is not instantly visible to a fresh freebusy query (Google's own
propagation, and our refresh cadence, both take time). In that window a slot
just booked through noCluCal would still be offered by an external-only busy
read. Including the host's confirmed bookings in the busy set means a slot
booked through noCluCal never reappears, regardless of write-back timing.

This is the live-read layer (layer 1) of the four-layer double-booking defense
documented in § Booking model. It is a filter, not a guarantee: it races, which
is exactly why the exclusion constraint (layer 3) is the hard floor underneath
it. The orchestration's job is to keep the floor from being hit in normal
operation by not offering times that are already taken.

### No connection degrades; an unreadable connection refuses

The result is expressive rather than all-or-nothing: `{ slots,
externalBusyChecked }`. The two failure-ish states are deliberately different:

- **No calendar connection** is normal, not an error. The host may not have
  connected Google yet. Slots are computed from availability and internal
  bookings only, and `externalBusyChecked` is `false` so the caller (4c) can
  decide how to present a host whose external calendar was not consulted. The
  call does not throw.
- **A connection that exists but cannot be read** (token refresh failed, or the
  freebusy call failed) throws `CalendarUnavailableError`. We refuse to offer
  slots we could not verify against the host's real calendar, because offering
  an unverified slot risks a double booking the invitee would experience as a
  broken promise. Refusing is the safe failure.

A missing or disabled event type throws `NotBookableError`: there is nothing
bookable to compute slots for, and surfacing that as a clean error beats
returning an empty slot list that looks like "no availability".

### The injectable resolver seam

The external-busy fetch sits behind an `ExternalBusyResolver`: given a host and
a window, it returns `{ connected, busy }`, returning `connected: false` when
the host has no connection and throwing when a connection exists but cannot be
read. `getAvailableSlots` takes an optional `resolveExternalBusy` dependency and
falls back to a default implementation that does the real
`getConnectionForUser` → `getValidTokensForConnection` (the 60-second-margin
refresh wrapper) → `provider.getFreeBusy` path. The default lets a
`RefreshFailedError` or a freebusy failure propagate; the orchestrator catches
any throw from the resolver and re-wraps it as `CalendarUnavailableError`.

The seam exists for testability: the integration tests seed a real database and
inject a stub resolver, so the whole orchestration (event-type gating, timezone
fallback, availability mapping, internal-booking read, the union, and the
expressive result) is exercised against real rows without a network call.
`available-slots.ts` statically imports the side-effecting
`providers/register-all` so the default resolver's `getProvider("google")` (and
the refresh path inside `getValidTokensForConnection`) resolve at runtime; tests
never reach that code path.

### Window expansion

The freebusy window is the requested `[rangeStart, rangeEnd]` expanded on each
side by the larger of the two buffers. A busy block sitting just outside the
requested range can still block an edge slot through that slot's buffer guard,
so the busy read has to look slightly wider than the range itself. The same
expanded window bounds both the external freebusy query and the internal
confirmed-bookings read.

## Public booking page (Phase 4c)

Phase 4c ships the first invitee-facing surface: the public booking page at
`/[username]/[slug]` (`src/app/[username]/[slug]/page.tsx` plus the
`booking-picker.tsx` client component), with `resolvePublicEventType` at
`src/lib/booking/resolve.ts` and `getEventTypeBySlug` in
`src/lib/event-types/queries.ts` for route resolution. It is read-only: browse
the host's available times and select one. The invitee form, the confirm
action, the booking write, the Google event, and the confirmation screen are
4d, so selection ends at a summary with no form and no confirm control.

### Route shape, public and dynamic

The route is a root-level two-segment dynamic route, anonymous and outside the
`proxy.ts` auth matcher (the matcher only covers `/me`, `/settings`, and the
Google connect route, so nothing extra was needed). Static routes (`/me`,
`/settings`) take precedence over the dynamic segment. The page is
`export const dynamic = "force-dynamic"`: it reads live freebusy on every
request, so it must never be statically generated or cached. The page is
reachable only by its exact URL; no front door links to it yet (that is 4e), so
it is testable without being publicly surfaced (the root layout already sets
`robots: noindex`).

The root-level `[username]/[slug]` shape has one tooling consequence:
`@next/next/no-html-link-for-pages` compiles each `[segment]` to a broad
wildcard and greedily collapses both segments, so its route pattern then matches
nearly any internal `<a href>` and misfires on legitimate full-navigation
anchors (the OAuth-initiating `<a>` on `/settings/calendars`, which must be a
real navigation, not a prefetching `<Link>`). The rule is a Pages-Router-era
guard and is turned off in `eslint.config.mjs`; this is the durable reason.

### Resolution and the bounded fetch window

`resolvePublicEventType({ username, slug })` looks the host up by `username` in
`noclucal_users` (citext, so the match is case-insensitive) and the event type
up by `(hostUserId, slug)`, gating on `enabled`. Unknown user, unknown slug, and
disabled event type all collapse to a single `null` so the page renders one
404 via `notFound()`. The `enabled` gate lives in the resolver, not in
`getEventTypeBySlug`, so later flows can reuse the slug lookup without the gate.
The lookup resolves a host by `username`, which is unique as of Phase 4e
(`noclucal_users_username_unique`, migration 0005), so it returns at most one
host. The absolute share link a host copies from `/settings/event-types` is
built by `publicBookingUrl(username, slug)` in `src/lib/app-url.ts`
(`<getAppOrigin()>/<username>/<slug>`), the single place the public-route shape
is constructed so the link and the route stay in step.

The page fetches `getAvailableSlots` for `[now, now + min(maxFutureMinutes, 90
days)]`, capping the horizon a single render asks of the engine and Google
freebusy (the engine clamps further by `now + minNoticeMinutes`). The UTC `Slot`
instants are serialized to ISO strings and handed to the client picker.

### Engine UTC, picker timezone

The split decided for `computeSlots` carries through to rendering: the engine
stays UTC and the invitee timezone is purely a UI concern. The picker detects
the invitee zone with `Intl` (read through `useSyncExternalStore` so the server
and first client render agree, avoiding a hydration mismatch without a
set-state-in-effect), offers a selector over `Intl.supportedValuesOf`, and
groups the UTC instants into invitee-local days with Luxon. Day-then-time
selection ends at a summary (`Booking <event> on <weekday>, <date> at <time>
<tz abbreviation>`).

### Never offer an unverified slot

The outcome policy is the same refusal stance as the orchestration: the page
never renders times it could not verify against the host's real calendar.

- `externalBusyChecked: false` (the host has no connected calendar): a calm
  "not available yet" state. The slots were computed from availability and
  internal bookings only, never checked against Google, so they are not offered.
- `CalendarUnavailableError` (a connection exists but could not be read): a
  "temporarily unavailable, please try again" state.
- success with `externalBusyChecked: true` and zero slots: a "no times are
  currently available" state.
- `NotBookableError` (missing or disabled event type): `notFound()`.
- success, checked, with slots: the picker.

Only the last branch renders the picker. The outcome is resolved as plain data
inside the `try`/`catch` and the JSX is built afterward, because constructing a
component inside a `try`/`catch` does not catch its render errors (the linter
rejects it).

## Booking write flow (Phase 4d)

Phase 4d is the first flow that writes to both the database and Google in one
request: the public page completes a booking. The invitee form (name, email,
optional note) lives in `booking-picker.tsx`; the `confirmBooking` server action
at `src/app/[username]/[slug]/actions.ts` does the write. The action is
anonymous (the invitee is not signed in), so there is no `auth()` call; authz is
by public route resolution, never a client-passed id. Both external calls (the
re-check's `getAvailableSlots` and the Google write-back `createCalendarEvent`)
are injected so the integration tests run against the seeded database without
touching Google.

### The operation order is the contract

The five steps run in this exact order, and the order is the correctness
argument:

1. **Validate.** The invitee input is re-parsed server-side with Zod (name
   non-empty, email valid, note bounded, slot instants parse, invitee timezone a
   valid IANA zone). The client form is convenience; this is the gate.
2. **Re-resolve.** `resolvePublicEventType({ username, slug })` runs again
   server-side. Unknown or disabled collapses to a `not_bookable` result. The
   action never trusts a client-supplied `hostUserId` or `eventTypeId`; it
   derives both from this lookup.
3. **Live re-check.** `getAvailableSlots` runs over a narrow window covering the
   slot, and the action asserts a returned slot has the same start instant. If
   not, it returns `unavailable`. This catches the slot having gone busy on
   Google, or having fallen outside availability (or inside min-notice), since
   the page rendered. The matched slot's own start and end become the
   authoritative values for the write, so a tampered client end cannot widen the
   booking.
4. **Claim the slot.** `createBooking` writes the confirmed row. This is the
   authoritative moment the slot becomes taken: the `bookings_no_overlap_per_host`
   exclusion constraint physically refuses a second overlapping confirmed insert,
   so two invitees racing through step 3 cannot both win. A `23P01` surfaces as
   `BookingConflictError`, which the action maps to a `conflict` result and
   creates no Google event.
5. **Best-effort Google event.** Only after the row exists does the action
   create the Google Calendar event (with a Meet link and `sendUpdates: "all"`),
   then `updateBookingGoogleRefs` stores the event id, html link, and Meet link
   on the row.

### Why claim precedes the Google write

The booking row plus the exclusion constraint is the guarantee; the Google event
is a write-back on top of it. If Google were written first, a failure there would
either lose the slot (if we abort) or leave a Google event with no booking row
(if we proceed), and a slow Google call would widen the window in which a second
invitee could claim the same time. Claiming first means the slot is reserved the
instant the constraint accepts the insert, and everything after is decoration on
an already-correct booking.

A Google failure after the claim is therefore logged and swallowed: the booking
stays `confirmed` with null Google refs, and the action still returns `success`.
A calendar hiccup must never lose a slot the invitee legitimately claimed. The
host can reconcile a ref-less booking later (a backfill is a future nicety); the
booking itself is whole because its snapshot columns are self-describing.

### The conflict and unavailable paths

`conflict` (a `23P01` at step 4) and `unavailable` (no matching slot at step 3)
are distinct results the picker renders differently in prose but identically in
affordance: both show a "choose another time" control that resets the selection
and calls `router.refresh()` to pull a fresh slot list from the server, so a
just-taken time disappears. `not_bookable` (the page stopped resolving) and
`invalid` (Zod rejected the input, with per-field messages) round out the
discriminated union the action returns.

### The accepted residual external TOCTOU

Steps 3 and 4 close the internal race (two noCluCal invitees) completely: the
constraint is the floor. They do not close the external race against Google. In
the window between the step-3 freebusy read and the step-4 insert, the host could
accept a conflicting event directly in Google; the constraint does not know about
that event (it guards only noCluCal's own `bookings` table), so the booking still
lands. This residual external TOCTOU is accepted and minimized by putting the
re-check immediately before the claim. Closing it entirely would require a
transactional reservation against Google, which Google's API does not offer. The
exposure is a host double-book the host can resolve, not an invitee-visible
broken promise on noCluCal's own slots.

### `sendUpdates: "all"` is the invitee's immediate confirmation

The Google event is created with `sendUpdates: "all"`, so Google emails its own
calendar invitation (carrying the Meet link) to the invitee the moment the event
is inserted. That is deliberately the invitee's confirmation channel for now: the
branded noCluCal confirmation email is Phase 5, and leaning on Google's invite
means there is never a silent success where the invitee gets nothing. The Meet
link is also shown in the in-place confirmation when present. There is no rate
limiting on the public form yet (a follow-up), and reschedule and cancel are
Phase 6.
