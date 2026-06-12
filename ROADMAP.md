# Roadmap

Version targets and planned work for noCluCal.

---

## Status snapshot

- Phase 0 (Bible seeding): complete (2026-05-26).
- Phase 1a (foundation scaffold and CI/CD chain): complete (2026-05-26). Next.js 16 scaffold, Tailwind v4, Vitest harness, multi-stage Dockerfile, GitHub Actions CI and Deploy. Site live at https://cal.noclulabs.com with the placeholder homepage.
- Phase 1b (database wiring): complete (2026-05-26). Drizzle + `pg` connection module at `src/lib/db/index.ts` (lazy-init, max 10 pool, libpqcompat documented), `docker-compose.dev.yml` for local Postgres 18 on host port 5434, `pnpm db:smoke` validates connectivity. No schema yet.
- Phase 1c (first migration, migrator stage, CI test DB): complete (2026-05-27). First schema (`noclucal_users` shadow table) and first migration shipped. Migrator Docker stage and `migrate` Compose profile wired into `deploy.yml` so migrations apply before the web container rebuilds. CI gained a `postgres:18-alpine` service container and the `db:test:setup` step.
- Phase 1d (Auth.js v5 in SSO RP mode): complete (2026-05-27). Edge-safe / server-only config split (`auth.config.ts` / `auth.ts` / `proxy.ts`), empty providers array, cookie domain `.noclulabs.com` in production, NextAuth handlers route, `noclucal_users` lazy-upsert helper, and the `/me` proof-of-life page. Phase 1 closed; Phase 2 (Google Calendar provider) ready.
- Phase 2a (CalendarProvider interface and calendar_connections schema): complete (2026-05-29). Interface contract, provider registry stubs, calendar_connections schema with unique-per-provider constraint, and migration shipped. No Google code yet; that lands in Phase 2b.
- Phase 2b (token encryption helpers): complete (2026-05-29). AES-256-GCM helpers at `src/lib/calendar/crypto.ts` with versioned `v1:base64nonce:base64ciphertext` ciphertext format, lazy key loading, and 14-case test coverage including tamper detection and cross-key rejection.
- Phase 2c (Google Calendar provider implementation): complete (2026-05-29). `googleCalendarProvider` at `src/lib/calendar/providers/google.ts` implements every method on `CalendarProvider` over the `googleapis` SDK. `register-all.ts` wiring module ships. 42-case test suite stubs the SDK and verifies the call shape of every interface method.
- Phase 2d (Google Calendar connect, disconnect, and settings page): complete (2026-06-03). OAuth connect and callback routes, disconnect server action, `/settings/calendars` page, refresh wrapper with 60s safety margin, cookie-based CSRF state, transactional connection upsert. Phase 2 MVP closed; users can connect a Google account, see it on the settings page, and disconnect it.
- Phase 3a (event types and availability schema): complete (2026-06-04). Storage shape for the booking core: `event_types`, `host_settings`, `availability_rules`, and `availability_overrides` tables, the shared `EVENT_TYPE_COLORS` palette at `src/lib/event-types/colors.ts`, and the additive migration 0002. Integer-minute durations, ISO 1 to 7 weekday matching Luxon, split-day support, CHECK constraints, per-user single schedule. Storage only; slot computation is 3b and the settings UI is 3c.
- Phase 3b (slot computation engine): complete (2026-06-04). The pure `computeSlots` function at `src/lib/scheduling/compute-slots.ts`, numeric interval helpers at `src/lib/scheduling/intervals.ts`, and scheduling types at `src/lib/scheduling/types.ts`. Deterministic and fully injected (reference clock, range, host timezone, availability, event type, and busy intervals are all arguments); replace-with-block-wins override composition; half-open buffer overlap; wall-clock stepping with a spring-forward gap detector and fall-back single offering; min-notice and max-future clamp on the slot start. First use of Luxon. Exhaustively unit-tested; not yet wired to a consumer (3c is the first). The Zod input validators and CRUD helpers originally filed under 3b moved to 3c, where input validation belongs.
- Phase 3c (event types management): complete (2026-06-04). The first user-facing booking feature: signed-in users create, edit, and delete event types at `/settings/event-types`. Zod validation at `src/lib/event-types/validation.ts` (slug rules, reserved words, `slugify`, field bounds, notice-versus-future refine); user-scoped data-access at `src/lib/event-types/queries.ts` with `SlugConflictError` mapping the unique violation to a field error; the list, `new`, and `[id]` edit pages, the `EventTypeForm` client component, and the create/update/delete server actions, all styled to match `/settings/calendars`. First use of Zod. Validation unit tests and data-access integration tests, including cross-user scoping; action and component tests deferred per the Phase 2d precedent. The CLAUDE.md File Structure tree was rebuilt to current reality. Availability and timezone UI is 3d; date overrides are 3e; a live slot preview is 3f.
- Phase 3d (weekly availability and timezone management): complete (2026-06-04). Signed-in users set a weekly recurring availability schedule and their booking timezone at `/settings/availability`. Zod validation at `src/lib/availability/validation.ts` (ISO 1 to 7 weekday, wall-clock `"HH:MM"` time ordering, Luxon-backed timezone validity); user-scoped data-access at `src/lib/availability/queries.ts` (transactional weekly-replace where an empty set clears the schedule, plus the host-timezone upsert); the `/settings/availability` page with the Calendly-style weekly editor (per-weekday ranges with add, remove, and copy-to-all-days), the timezone picker populated from `Intl.supportedValuesOf` and re-validated server-side with Luxon, and two independent save actions. The week saves at once as one JSON `schedule` field. Validation unit tests and data-access integration tests; action and component tests deferred per the Phase 2d precedent. Date overrides are 3e; a live slot preview is 3f.
- Phase 3e (date overrides): complete (2026-06-04). Signed-in users block a single date or give it custom hours that replace the weekly rules for that day, in a third section on `/settings/availability`. `dateOverrideInputSchema` at `src/lib/availability/validation.ts` is date-keyed with block-versus-custom exclusivity (a Luxon validity refine rejects impossible dates); override data-access at `src/lib/availability/queries.ts` (`listAvailabilityOverridesForUser`, the per-date transactional `setDateOverrideForUser`, and `deleteDateOverrideForUser`, all scoped by user); the `OverridesEditor` component and the set and delete actions, the override travelling as one JSON `override` field and re-validated server-side. No schema, migration, or dependency change (the `availability_overrides` table already exists from 3a; the replace-with-block-wins composition already lives in `computeSlots` from 3b). Validation unit tests and data-access integration tests, including replace-clears-previous and per-user isolation; action and component tests deferred per the Phase 2d precedent. This closes the required Phase 3 scope; only the optional live slot preview (3f) remains in Phase 3, and Phase 4 (public booking page plus Redis slot holds) is the next major phase.
- Phase 3f (settings navigation and shell): complete (2026-06-04). The polish pass that ties the settings pages into a navigable product: a left sidebar over all of `/settings` (`layout.tsx` plus the `"use client"` `settings-nav.tsx` with `usePathname` active-route highlighting), the `/settings` overview home with live read-only status cards for the calendar connection, event types, and availability, a relying-party sign-out action that clears the shared suite session, and one honest Bookings placeholder behind a "soon" nav item ahead of Phase 4. The calendars, event types, and availability pages were reframed to render inside the shell without duplicated chrome (behavior unchanged), and the `proxy.ts` matcher now protects the bare `/settings` route too. Presentational shell, so no new automated tests (no component harness in the repo; Playwright reserved); the existing suite passes unchanged and the shell was verified manually. Grounded in the existing Indigo Signal tokens from `globals.css`; `CALENDAR-PLAYBOOK.md` untouched (app-shell work, not booking core). The optional live slot preview remains the only open Phase 3 item; Phase 4 is the next major phase.
- Phase 4 started (2026-06-08). Phase 4a (bookings schema and double-booking constraint): complete (2026-06-08). The booking data layer: the `bookings` table (an immutable historical record that snapshots the event type name and duration and keeps a nullable `ON DELETE SET NULL` FK to `event_types`), migration 0003 adding the `btree_gist` extension and the `bookings_no_overlap_per_host` exclusion constraint (`EXCLUDE USING gist` over `host_user_id WITH =` and `tstzrange(starts_at, ends_at) WITH &&` where `status = 'confirmed'`, half-open and per host), status constants, and the host-scoped data-access (`createBooking` mapping the `23P01` exclusion violation to `BookingConflictError`, `listBookingsForHost`, `getBooking`). The exclusion constraint is the hard floor of the double-booking defense. Ships implemented and tested (12 integration cases) but unwired, mirroring how the slot engine shipped in 3b. Deep rationale in `CALENDAR-PLAYBOOK.md` § Booking model. No Redis, orchestration, UI, or runtime consumer yet (4b through 4e).
- Phase 4b (available-slots orchestration): complete (2026-06-08). `getAvailableSlots` at `src/lib/booking/available-slots.ts`, the first runtime consumer of the 3b `computeSlots` engine: it loads and gates the event type, resolves the host timezone (falling back to the column default) and availability, reads the host's confirmed bookings, fetches live Google freebusy behind an injectable resolver, and feeds `computeSlots` a busy set that is the union of external (Google) and internal (the host's own bookings). Expressive result (`slots` plus `externalBusyChecked`): no connection degrades gracefully, an unreadable connection throws `CalendarUnavailableError`, and a missing or disabled event type throws `NotBookableError`. Adds `listConfirmedBookingsInWindow` to the bookings data-access. Read-only and not yet wired to a page; 9 integration tests with the resolver stubbed (no network). Redis slot holds, previously planned as 4b, are deferred (see Deferred items). Deep rationale in `CALENDAR-PLAYBOOK.md` § Available-slots orchestration. 4c through 4e remain.
- Phase 4c (public booking page and slot picker): complete (2026-06-08). The first invitee-facing surface: the public, anonymous, dynamic page at `/[username]/[slug]` (`src/app/[username]/[slug]/page.tsx` plus the `booking-picker.tsx` client component), with `resolvePublicEventType` at `src/lib/booking/resolve.ts` and `getEventTypeBySlug` in `src/lib/event-types/queries.ts` for route resolution. It resolves the route or 404s (unknown user, unknown slug, and disabled event type all collapse to one `notFound()`), fetches a bounded window of slots via `getAvailableSlots` (`[now, now + min(maxFutureMinutes, 90 days)]`), and renders them in the invitee's timezone with a Luxon-grouped day-then-time picker (timezone detected via `Intl` through `useSyncExternalStore`, with a selector). Robust outcome handling that never offers an unverified slot: no connected calendar shows "not available yet", a `CalendarUnavailableError` shows "temporarily unavailable", a verified empty window shows "no times are currently available", and only a verified window with slots renders the picker. Read-only: selection ends at a summary, with the form, confirm, booking write, Google event, and confirmation screen deferred to 4d. Outside the `proxy.ts` auth matcher (no matcher change needed). `@next/next/no-html-link-for-pages` was turned off in `eslint.config.mjs` because the root-level two-segment dynamic route makes it misfire on internal anchors. 6 resolution integration tests; the page and picker verified manually (no component harness). Deep rationale in `CALENDAR-PLAYBOOK.md` § Public booking page. 4d and 4e remain.
- Phase 4d (booking write flow): complete (2026-06-09). The public page now completes a booking. The invitee form (name, email, optional note) in `booking-picker.tsx` and the `confirmBooking` server action at `src/app/[username]/[slug]/actions.ts`, the first flow that writes to both the database and Google. Anonymous and fully server-re-resolved (no client-trusted ids); load-bearing operation order: validate, re-resolve, live re-check, claim via `createBooking` (the `bookings_no_overlap_per_host` exclusion constraint is the authoritative taken moment, a `23P01` becomes the conflict path and creates no event), then best-effort Google event with a Meet link and `sendUpdates: "all"` (so Google sends the invitee its own invite immediately), then `updateBookingGoogleRefs` stores the event id, html link, and Meet link. A Google failure leaves the booking confirmed with null refs and still returns success; a calendar hiccup never loses a claimed slot. Discriminated result (`success | conflict | unavailable | not_bookable | invalid`) rendered in place by the picker. Migration 0004 adds the nullable `google_html_link` and `meet_link` columns (`google_event_id` already shipped in 0003); `createEvent` gained `sendUpdates`, `CalendarEvent` gained `htmlLink`. Both external calls are injected; 8 integration tests with Google stubbed (happy path, conflict, unavailable, Google failure, validation, not bookable). The accepted residual external TOCTOU and the no-rate-limiting follow-up are noted in `CALENDAR-PLAYBOOK.md` § Booking write flow. Only 4e remains to close Phase 4.
- Phase 5 started (2026-06-11). Phase 5a (Redis and BullMQ infrastructure): complete (2026-06-11). Stands up the queue substrate, tested but with no real jobs yet. The lazy, side-effect-free Redis connection module at `src/lib/queue/connection.ts` (mirroring `src/lib/db/index.ts`: nothing connects at import, a missing `REDIS_URL` throws on first use, the Worker takes its own connection while the producer memoizes a shared one, all with `maxRetriesPerRequest: null`); queue constants and the notifications-queue producer handle under the `noclucal` key prefix; the worker scaffold and the `src/worker.ts` process entry with `ready` / `failed` / `error` logging and graceful SIGTERM / SIGINT shutdown; a `redis:smoke` diagnostic script; Redis services in dev (host port 6380) and prod compose, both with `--maxmemory-policy noeviction` and `--appendonly yes`; a dedicated `worker` compose service running through tsx on a new `worker` Dockerfile stage placed between `migrator` and `runner` (so `runner` stays the default target); and a Redis service container in CI. A trivial `health` job proves the enqueue-to-process round trip in tests; no confirmation or reminder job types yet. Dependencies: `bullmq` 5.78.0 and `ioredis` 5.10.1 added exact, `tsx` 4.22.3 moved to a regular dependency exact (the worker needs it at runtime). `deploy.yml` is unchanged; the required ops step on merge is adding `REDIS_URL=redis://redis:6379` to the droplet `/opt/noclucal/.env`. 5b through 5e remain.
- Phase 5b (Resend and the confirmation email): complete (2026-06-12). Ships the branded booking-confirmation email capability, deliberately unwired: a lazy, server-only Resend client at `src/lib/email/client.ts` (mirrors the DB and queue modules; `RESEND_API_KEY` and `EMAIL_FROM` throw on first use, never at import; `import "server-only"` keeps the key out of client bundles), the React Email template at `src/emails/booking-confirmation.tsx` (inline styles, Indigo Signal tokens, the start instant rendered in the invitee timezone via the new `formatInstantForEmail` Luxon helper, the Meet link as a button when present, the optional note; complements Google's own invite), and `sendConfirmationEmail` at `src/lib/email/send-confirmation.ts`. Nothing in the booking flow or the worker calls it and the queue modules are untouched; Phase 5c wires the send through a queued job. Dependencies pinned exact: `resend` 6.12.4, `@react-email/components` 1.0.12, `@react-email/render` 2.0.8, `server-only` 0.0.1. Tests mock the Resend SDK (no network, no real key). No schema change; whether the booking record should persist the invitee timezone is a 5c planning question. 5c through 5e remain.
- Phase 4e (front door, share links, and closeout): complete (2026-06-09). The closing polish PR for Phase 4. The root `/` now redirects to `/settings` (the placeholder is gone), so an authenticated host lands in the app and an unauthenticated visitor follows the existing SSO bounce. Each event type on `/settings/event-types` shows its full public booking URL (built by `publicBookingUrl(username, slug)` in `src/lib/app-url.ts` via `getAppOrigin()`, never a hardcoded host) with a copy-to-clipboard button (`copy-link.tsx`). Migration 0005 adds the case-insensitive `noclucal_users_username_unique` index, making `username` unique now that the public route resolves a host by it (no duplicates existed; the `bookings_no_overlap_per_host` exclusion constraint is untouched, confirmed by a no-op second `db:generate`). The post-booking confirmation line now names the invitee email ("A calendar invitation has been sent to <email>") via a new `inviteeEmail` field on `BookingConfirmation`. URL-builder unit tests added; the routing, copy button, and confirmation copy verified manually. CLAUDE.md trimmed back under its 40,000-char budget (the redundant 4d new-column note removed). This closes Phase 4: end-to-end booking is live. Phase 5 (Resend notification emails) and Phase 6 (reschedule / cancel) are next.

---

## Phase 0: Bible seeding (complete)

- [x] Create `CLAUDE.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md` at repo root.
- [x] Create `.gitignore` (standard Node + Next.js + .env*).
- [x] Capture architectural decisions: stack, SSO bridge to noclulabs, separate database in shared DO Managed Postgres cluster, `CalendarProvider` interface, deployment shape mirroring noclulabs and portalNetwork.
- [x] No code, no `package.json`, no scaffold.

## Phase 1: Repo scaffold

Sets up the Next.js 16 + Drizzle + Auth.js skeleton with the SSO bridge wired and the production deploy path validated end-to-end. Split into 1a (scaffold + CI/CD), 1b (database), 1c (migrator), 1d (Auth.js RP).

### Phase 1a: foundation scaffold and CI/CD chain (complete)

- [x] Next.js 16 App Router scaffold with `output: "standalone"`, TypeScript strict, Tailwind v4, ESLint, ESLint Next config, Vitest harness.
- [x] Placeholder homepage at `/` with the noClu voice (sentence case, no exclamation marks, no em dashes).
- [x] Indigo Signal palette duplicated from noclulabs in `src/app/globals.css` (no runtime coupling).
- [x] Space Grotesk via `next/font/google`, exposed as `--font-sans`.
- [x] Vitest harness with jsdom, `@/` path alias, smoke test verifying the alias resolves.
- [x] Multi-stage Dockerfile (deps / build / runner on `node:20-alpine`).
- [x] `docker-compose.yml` mapping host port 3002 to container port 3000.
- [x] GitHub Actions `ci.yml` (lint, type-check, test, build) and `deploy.yml` (SSH to droplet, pull, rebuild).
- [x] `.env.example` with Auth.js v5 RP-mode variables.
- [x] `robots.txt` blocking all crawlers until the booking flow ships.
- [x] Caddy reverse proxy block for `cal.noclulabs.com` deployed manually to the droplet during Phase 1a ops.

### Phase 1b: database wiring (complete)

- [x] Drizzle ORM + `pg` driver. `src/lib/db/index.ts` connection module mirroring noclulabs (lazy init via Proxy, max 10 pool, 30s idle, 5s connect timeout). Importing the module has no side effects; throws if `DATABASE_URL` is unset on first use.
- [x] `docker-compose.dev.yml` for local Postgres 18 on host port 5434 (avoid clash with noclulabs' 5433). Volume mounted at `/var/lib/postgresql` so PG18+ data lives under its major-version subdirectory.
- [x] `drizzle.config.ts` pointing drizzle-kit at `./src/lib/db/schema/*.ts` (currently empty) and `./drizzle/migrations/`.
- [x] `scripts/db-smoke-test.ts` + `pnpm db:smoke` permanent diagnostic infrastructure. Runs `SELECT version()`, `SELECT 1`, `SELECT NOW()` against the pool.
- [x] `noclucal_prod` provisioned in the shared DO Managed Postgres cluster; both URLs (public + VPC) captured in Bitwarden with the libpqcompat suffix; droplet `.env` updated.

### Phase 1c: migrator stage, deploy migrate profile, and first schema (complete)

- [x] First Drizzle schema file in `src/lib/db/schema/`: `noclucal_users` shadow table (id uuid PK from noclulabs JWT, username citext NOT NULL, display_name text nullable, observed_at timestamptz). Custom `citext` column type in `_types.ts`. Barrel `index.ts`. The broader set (`calendar_connections`, `event_types`, `availability_rules`, `bookings`) defers to Phase 2 and later when the booking core lands.
- [x] Refactor `src/lib/db/index.ts` to pass the schema into `drizzle(getPool(), { schema })` and re-export it so callers get typed `db.query.<table>` accessors.
- [x] First migration generated via `pnpm db:generate` and committed under `drizzle/migrations/0000_even_the_twelve.sql`. Hand-edited to prepend `CREATE EXTENSION IF NOT EXISTS citext;` (Drizzle does not auto-generate extension creation).
- [x] Add migrator Dockerfile stage mirroring noclulabs.
- [x] Add `migrate` profile to `docker-compose.yml`.
- [x] Extend `ci.yml` with a Postgres 18 service container, a job-level `DATABASE_URL`, and `pnpm db:test:setup` before lint.
- [x] Extend `deploy.yml` to run `docker compose --profile migrate run --rm --build migrate` before rebuilding the web container.
- [ ] `noclucal_users` projection write helper: on first observation of a user (any authenticated request where the user_id is not yet in `noclucal_users`), insert a row with cached username and display_name. Moved to Phase 1d to ship alongside the SSO bridge wiring that triggers the first observation.

### Phase 1d: Auth.js v5 SSO-RP mode (complete)

- [x] `auth.config.ts` (edge-safe, augmentations match noclulabs' JWT shape exactly: `{ id, username, role, signedInAt?, deviceId? }`), `auth.ts` (no providers), `proxy.ts` (Next.js 16 replacement for middleware; redirects unauthenticated visitors to `noclulabs.com/signin?redirect=...`).
- [x] Cookie domain `.noclulabs.com` in production (gated on `AUTH_URL` starting with `https://`). `__Secure-` cookie name prefix applied in lockstep. Shared `AUTH_SECRET` documented in `.env.example` with explicit note that it MUST match noclulabs' value.
- [x] NextAuth handlers route at `src/app/api/auth/[...nextauth]/route.ts`.
- [x] `noclucal_users` lazy-upsert helper at `src/lib/auth/upsert-noclucal-user.ts`. Best-effort: failures are logged but never break renders. Idempotent via `INSERT ... ON CONFLICT (id) DO UPDATE`.
- [x] `/me` proof-of-life page: calls `auth()`, runs the lazy upsert, renders the session payload.
- [x] Vitest config extended to load `.env.local` so DB-touching tests pick up `DATABASE_URL` locally; CI continues to set it at the job level. Three-case upsert test exercises insert, update, and null-displayName paths against the local / CI Postgres.
- [ ] First SSO bridge integration test (validating accept/reject for JWTs signed by the noclulabs secret vs a different secret). Deferred from 1d; the proof-of-life manual ops described in the PR cover the same ground until a second integration test target lands.

## Phase 2: Google Calendar provider

Implements the `CalendarProvider` interface and ships the first provider
end to end. No booking UI yet; just the connect / disconnect flow plus
busy-time reads. Webhook subscriptions are deferred (see "Deferred items").

### Phase 2a: CalendarProvider interface and calendar_connections schema (complete)

- [x] `CalendarProvider` interface at `src/lib/calendar/types.ts` with full JSDoc contract.
- [x] Provider registry helpers (`registerProvider`, `getProvider`, `listProviders`, `_resetRegistryForTests`) at `src/lib/calendar/providers/index.ts`.
- [x] `calendar_connections` schema at `src/lib/db/schema/calendar-connections.ts` with unique-per-(user, provider) constraint for MVP single-account semantics, plus a defense-in-depth unique on (user, provider, external_account_id) and a user lookup index.
- [x] Token columns shaped for the `v1:base64nonce:base64ciphertext` ciphertext format; encryption helpers deferred to 2b.
- [x] First Phase 2 migration generated by drizzle-kit and applied locally + via CI.
- [x] Registry unit test and calendar_connections schema integration test against the CI Postgres service container.

### Phase 2b: AES-256-GCM token encryption helpers (complete)

- [x] `src/lib/calendar/crypto.ts` exports `encryptToken` and `decryptToken`. AES-256-GCM via Node's built-in `node:crypto`; no external dependencies.
- [x] Ciphertext format `v1:base64nonce:base64ciphertext` with strict three-part parsing. Version prefix enables future key rotation without schema change.
- [x] Lazy key loading from `process.env.TOKEN_ENCRYPTION_KEY`. Module import has no side effects; the env var is read on first encrypt/decrypt call.
- [x] `.env.example` updated with `TOKEN_ENCRYPTION_KEY` documentation and the `openssl rand -base64 32` generation command.
- [x] 14-case Vitest suite covering round trip, empty-string and unicode plaintexts, nonce uniqueness across calls, tamper detection in ciphertext / auth tag / nonce, unknown-version rejection, malformed-format rejection, missing-key error, wrong-length-key error, and cross-key decryption failure.

### Phase 2c: Google Calendar provider implementation (complete)

- [x] `googleCalendarProvider` at `src/lib/calendar/providers/google.ts` implementing every method on `CalendarProvider`. Uses the `googleapis` SDK. Stateless; tokens passed as method arguments. Client credentials lazy-loaded from env.
- [x] Side-effecting `src/lib/calendar/providers/register-all.ts` that imports `./google` and calls `registerProvider`. 2d's OAuth route will be the first production import; 2c ships the file with its own test verifying registration works.
- [x] `googleapis` added to dependencies.
- [x] 42-case Vitest suite stubs `googleapis` via `vi.mock` and verifies each `CalendarProvider` method calls the right SDK method with the right arguments. No live Google calls.
- [x] OAuth scope list locked at four entries: `openid`, `email`, `calendar.events`, `calendar.readonly`. The `openid` + `email` pair is required for Google to return an id_token with the `sub` and `email` claims.
- [x] id_token verification via `OAuth2.verifyIdToken` is mandatory in `exchangeCode`; `email_verified` is intentionally NOT enforced.

### Phase 2d: OAuth routes, connect/disconnect actions, `/settings/calendars` page (complete)

- [x] Google Cloud Console OAuth client provisioned. Web application type. Authorized redirect URIs: `https://cal.noclulabs.com/api/calendar/google/callback` and `http://localhost:3000/api/calendar/google/callback`. Calendar API enabled. Client id and secret stored in Bitwarden under "noClu Infrastructure" and on the droplet `.env`.
- [x] `GET /api/calendar/google/connect` route: cookie-based OAuth state, redirect to `buildAuthorizationUrl`. Auth-gated (redirects to noclulabs signin if no session).
- [x] `GET /api/calendar/google/callback` route: validate cookie state, call `exchangeCode`, encrypt tokens via `encryptToken`, transactional DELETE-then-INSERT upsert into `calendar_connections`, redirect to `/settings/calendars`. Handles its own auth check (does not bounce to signin so the OAuth code is not lost).
- [x] `disconnectGoogleCalendar` server action: load connection, best-effort `provider.revoke`, unconditional local delete, revalidate `/settings/calendars`.
- [x] `/settings/calendars` server component: lists the connected Google account (or "connect" CTA), shows the connected email, offers disconnect via a server-action form. Renders error messages from the `?error=...` query string.
- [x] `proxy.ts` matcher extended to protect `/settings/*` and `/api/calendar/google/connect`. Callback route is NOT in the matcher.
- [x] Refresh token wrapper at `src/lib/calendar/connections.ts#getValidTokensForConnection`. 60-second safety margin. On refresh failure, deletes the connection row and throws `RefreshFailedError`.
- [x] `TOKEN_ENCRYPTION_KEY` in the droplet `/opt/noclucal/.env`. The OAuth callback is the first runtime invoker of `encryptToken`.
- [x] OAuth state via cookie (`__Host-noclucal-oauth-state` in prod, `noclucal-oauth-state` in dev). SameSite=lax. 10-minute max-age. Constant-time validation via `crypto.timingSafeEqual`.

## Phase 3: Event types and availability

Builds the booking core. Split into 3a (storage shape), 3b (slot
computation logic), 3c (event types management UI), 3d (weekly availability
and timezone UI), 3e (date overrides UI), and 3f (optional live slot
preview), mirroring how Phase 2 was split into 2a through 2d.

### Phase 3a: event types and availability schema (complete)

- [x] `event_types` table at `src/lib/db/schema/event-types.ts`: name, slug, description, integer-minute durations (duration, buffer-before, buffer-after, min-notice, max-future, slot-granularity), color as a named palette token, enabled flag, timestamps. uuidv7 PK. Unique index on `(user_id, slug)`; lookup index on `(user_id)`.
- [x] `host_settings` table at `src/lib/db/schema/host-settings.ts`: noCluCal-owned per-user config keyed on `user_id` PK, with an IANA `timezone` (default `America/Los_Angeles`). Keeps `noclucal_users` a pure projection of noclulabs identity.
- [x] `availability_rules` and `availability_overrides` tables at `src/lib/db/schema/availability.ts`: normalized recurring weekly windows and date-specific exceptions, keyed on `user_id` (one schedule per host for the MVP). ISO 1 to 7 weekday matching Luxon. Multiple rows per key support split days. CHECK constraints enforce the weekday range, start < end ordering, and the available/blocked override shape.
- [x] Shared `EVENT_TYPE_COLORS` palette at `src/lib/event-types/colors.ts`. Color validity is enforced at the app layer (3c), not by a DB CHECK or pg enum, so the palette evolves without a migration.
- [x] Migration `drizzle/migrations/0002_boring_nighthawk.sql`. Purely additive (CREATE TABLE plus indexes and checks); no extensions; standard migrate-then-rebuild deploy order.
- [x] Schema barrel re-exports the four new tables so `db.query.*` resolves with full type inference.
- [x] Integration tests for the new tables (round-trips, defaults, unique and CHECK constraint enforcement, split-day inserts, cascade deletes) plus a palette unit test.

### Phase 3b: slot computation (complete)

- [x] Slot computation: `computeSlots` at `src/lib/scheduling/compute-slots.ts`. Given a reference clock, a requested range, the host timezone, availability rules and overrides, an event type config, and busy intervals, returns a list of bookable UTC slot instants. Pure and deterministic; busy times are injected, not fetched. Invitee timezone is deliberately not an input (slots are timezone-agnostic instants; rendering in the invitee's zone is a UI concern). Exhaustively unit-tested with timezone edge cases (DST spring forward, DST fall back, half-hour offset zone, UTC date-boundary attribution). Numeric interval helpers at `src/lib/scheduling/intervals.ts` and types at `src/lib/scheduling/types.ts` ship alongside. Not yet wired to a consumer; 3c is the first.

### Phase 3c: event types management (complete)

- [x] Zod input validators for event types at `src/lib/event-types/validation.ts` (slug shape via regex, reserved words, `slugify`, field bounds, color membership against `EVENT_TYPE_COLORS` via `z.enum`, the minimum-notice-versus-maximum-future refine). First use of Zod.
- [x] Event type data-access at `src/lib/event-types/queries.ts`: `listEventTypesForUser`, `getEventType`, `createEventType`, `updateEventType`, `deleteEventType`, every function scoped by `userId`. `SlugConflictError` maps the Postgres unique violation (`23505`) to a friendly field error.
- [x] `/settings/event-types` list, `/new` create, and `/[id]` edit pages, the `EventTypeForm` client component, and the create/update/delete server actions. Server-side re-validation in every action; checkbox posts `"true"`/`"false"` and is read explicitly; color swatch picker consumes `EVENT_TYPE_COLOR_HEX`. Styling matches `/settings/calendars`.
- [x] Validation unit tests and data-access integration tests, including cross-user scoping and slug-conflict cases. Action and React component tests deferred per the Phase 2d precedent.
- [x] CLAUDE.md File Structure tree rebuilt to current reality (including the drifted Phase 2 calendar and settings files); new `## Event type management` design section.

### Phase 3d: weekly availability and timezone management (complete)

- [x] Zod input validators for weekly availability rules (ISO 1 to 7 weekday, wall-clock `"HH:MM"` time ordering via a 24-hour regex, end-after-start refine) and host settings (IANA timezone validity against Luxon's `IANAZone.isValidZone`) at `src/lib/availability/validation.ts`. The availability and timezone equivalents of the event type validators delivered in 3c.
- [x] Data-access at `src/lib/availability/queries.ts`, scoped by `userId` like the event type queries: `listAvailabilityRulesForUser` (ordered by weekday then start), the transactional `replaceAvailabilityRulesForUser` (delete-then-insert; an empty set clears the schedule), `getHostSettings`, and `upsertHostTimezone` (insert with `onConflictDoUpdate` on the PK).
- [x] `/settings/availability` page with the Calendly-style weekly editor (per-weekday ranges with add, remove, and copy-to-all-days, plus client-side end-after-start flagging), the timezone picker populated from `Intl.supportedValuesOf` and re-validated server-side with Luxon, and two independent save actions. The week saves at once as one JSON `schedule` field. Times are `"HH:MM"` end to end; the time column's seconds are truncated on read.
- [x] Validation unit tests and data-access integration tests (replace-clears-previous, per-user isolation, weekday-then-start ordering, host-timezone upsert). Action and component tests deferred per the Phase 2d precedent.

### Phase 3e: date overrides (complete)

- [x] Zod input validator and data-access for `availability_overrides` (blocked days and custom-hours days, the mutually-exclusive override shape from 3a), scoped by `userId` like the weekly rules. `dateOverrideInputSchema` is date-keyed with a block-versus-custom exclusivity refine and a Luxon validity check on the date; `listAvailabilityOverridesForUser`, the per-date transactional `setDateOverrideForUser` (delete-then-insert scoped to one date), and `deleteDateOverrideForUser`.
- [x] Date-specific override management as a third section on the `/settings/availability` page: block a date, or set custom hours that replace the weekly rules for that date, composing with the replace-with-block-wins model the 3b engine already implements. The `OverridesEditor` client component (existing-override list with edit and remove, an inline add form with a today-floored date input and a block-or-custom choice) plus the set and delete server actions; the override travels as one JSON field and is re-validated server-side. Validation unit tests and data-access integration tests added to the existing availability suites. No schema, migration, or dependency change.

### Phase 3f: settings navigation and shell (complete)

- [x] Settings app shell at `src/app/settings/layout.tsx` (sidebar over all of `/settings`, centered content frame, responsive collapse to a top bar) and the `"use client"` `settings-nav.tsx` with `usePathname` active-route highlighting and the nav order Overview, Event types, Availability, Calendars, Bookings (the last behind a "soon" badge).
- [x] `/settings` overview home with live read-only status cards (calendar connection, event type count, weekly availability plus timezone), each linking into its section, plus a quiet note that the public booking page is coming.
- [x] Sign-out server action at `src/app/settings/actions.ts` (`signOut` then redirect to noclulabs sign-in); clears the shared `.noclulabs.com` suite session.
- [x] Minimal Bookings placeholder page at `src/app/settings/bookings/page.tsx` ahead of the Phase 4 public booking page.
- [x] Reframed the calendars, event types, and availability pages to render inside the shell without duplicated chrome (behavior preserved); `proxy.ts` matcher extended to protect the bare `/settings` route.

### Phase 3g: live slot preview (planned, optional)

- [ ] Optional live slot preview that calls `computeSlots` for a chosen event type against the host's availability, the first runtime consumer of the Phase 3b engine. Reads Google freebusy for the host and renders a small upcoming-slots grid in the settings UI.

## Phase 4: Public booking page

Builds the public booking flow on top of the booking core. Split into 4a
(bookings schema and the double-booking constraint), 4b (available-slots
orchestration, the first `computeSlots` runtime consumer), 4c (public booking
page and slot picker), 4d (confirm flow: write the booking, create the Google
event, conflict handling), and 4e (confirmation and polish, plus the front-door
routing), mirroring how Phases 2 and 3 were split. Redis-backed slot holds,
originally planned as a Phase 4 sub-phase, are deferred (see Deferred items):
the 4a exclusion constraint is the hard floor and 4b's live freebusy read is the
optimization layer above it for now.

### Phase 4a: bookings schema and double-booking constraint (complete)

- [x] `bookings` table at `src/lib/db/schema/bookings.ts`: an immutable historical record. Snapshots the event type name and duration at booking time; nullable FK to `event_types` (`ON DELETE SET NULL`) so history survives event-type deletion; `host_user_id` FK cascade; invitee fields; `starts_at` / `ends_at` timestamptz; `status` varchar default `confirmed`; `google_event_id` nullable (set in 4d). uuidv7 PK; lookup indexes on `(host_user_id)`, `(host_user_id, starts_at)`, `(event_type_id)`.
- [x] Status constants at `src/lib/bookings/constants.ts` (`BOOKING_STATUSES`, `BookingStatus`, `DEFAULT_BOOKING_STATUS`). App-level varchar, not a pg enum, so the lifecycle evolves without a migration.
- [x] Migration `0003` hand-adds the `btree_gist` extension and the `bookings_no_overlap_per_host` exclusion constraint (`EXCLUDE USING gist (host_user_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status = 'confirmed')`). Half-open ranges so abutting bookings do not conflict; per host; partial on confirmed. Drizzle does not model `EXCLUDE`; a second `db:generate` confirmed no drop is emitted, so the constraint is hand-managed.
- [x] Host-scoped data-access at `src/lib/bookings/queries.ts`: `createBooking` (maps the `23P01` exclusion violation to `BookingConflictError` via the drizzle cause chain), `listBookingsForHost`, `getBooking`. No Zod; invitee input validation is deferred to 4d. Ships unwired, like the 3b slot engine.
- [x] Integration tests at `tests/lib/bookings/queries.test.ts` (12 cases): create-then-read with snapshot and timestamp persistence, list ordering and per-host isolation, cross-host scoping, overlap rejection, abutting allowed (half-open), per-host isolation of the guard, cancelled-does-not-block, and event-type-deletion-keeps-history.
- [x] Bibles: `CALENDAR-PLAYBOOK.md` gains the `## Booking model` rationale; CLAUDE.md gets the factual table definition, a pointer, and the Drizzle-EXCLUDE gotcha.

### Phase 4b: available-slots orchestration (complete)

- [x] `getAvailableSlots` at `src/lib/booking/available-slots.ts`, the first runtime consumer of the Phase 3b `computeSlots` engine. Loads and gates the event type, resolves the host timezone (falling back to the column default) and availability, reads the host's confirmed bookings, fetches live Google freebusy, and calls `computeSlots` with `busy = external ∪ internal`. Read-only; no booking write (4d) and no URL resolution (4c).
- [x] `listConfirmedBookingsInWindow` added to `src/lib/bookings/queries.ts`: a host's confirmed bookings overlapping a half-open window, the internal half of the busy set (so a slot booked through noCluCal is excluded before the Google write-back propagates).
- [x] Expressive, fail-safe semantics: `{ slots, externalBusyChecked }`; no connection degrades (compute from availability and internal bookings, `externalBusyChecked` false); an unreadable connection throws `CalendarUnavailableError` rather than offering unverified slots; a missing or disabled event type throws `NotBookableError`. The external-busy fetch is behind an injectable resolver so tests run without network.
- [x] Integration tests at `tests/lib/booking/available-slots.test.ts` (9 cases): connected happy path, no-connection degrade, internal-booking exclusion, external-plus-internal union, cancelled-does-not-block, read-failure refusal, the disabled and missing not-bookable cases, and a min-notice config-flow-through sanity case.
- [x] Bibles: `CALENDAR-PLAYBOOK.md` gains the `## Available-slots orchestration` section; CLAUDE.md gets a lean pointer under § Slot computation plus the file-tree entries.
- Redis-backed slot holds, originally this sub-phase, are deferred (see Deferred items).

### Phase 4c: public booking page and slot picker (complete)

- [x] `/[username]/[slug]` public booking page (`src/app/[username]/[slug]/page.tsx`): anonymous, dynamic (`force-dynamic`, never cached because it reads live freebusy), outside the `proxy.ts` auth matcher. Resolves the route via `resolvePublicEventType` (`src/lib/booking/resolve.ts`) and 404s on unknown user, unknown slug, or disabled event type; fetches a bounded window of slots via `getAvailableSlots`; renders the host's bookable times with the never-offer-an-unverified-slot outcome policy (no-connection, read-failure, zero-slots, and not-bookable each get their own state).
- [x] `booking-picker.tsx` client component: detects the invitee timezone with `Intl` through `useSyncExternalStore` (hydration-safe), offers a timezone selector over `Intl.supportedValuesOf`, groups the UTC slot instants into invitee-local days with Luxon, and renders day-then-time selection ending at a summary. Read-only; the form and confirm are 4d.
- [x] `getEventTypeBySlug` in `src/lib/event-types/queries.ts` (scoped on `(userId, slug)`, enabled-agnostic so 4d can reuse it) and `resolvePublicEventType` (the `enabled` gate lives in the resolver). Assumes `username` is unique; the column is not yet constrained unique (follow-up).
- [x] `@next/next/no-html-link-for-pages` turned off in `eslint.config.mjs`: the root-level two-segment dynamic route makes the rule compile each `[segment]` to a broad wildcard and misfire on legitimate internal full-navigation anchors. No settings route was modified.
- [x] Resolution integration tests at `tests/lib/booking/resolve.test.ts` (6 cases: valid resolve, case-insensitive username, unknown user, unknown slug, disabled event type, per-user scoping). The page and picker are UI and verified manually (no component harness; Playwright reserved).
- The public profile `/[username]` listing a user's bookable event types is deferred to the 4e front-door work; 4c ships the single booking page reachable by exact URL.

### Phase 4d: booking write flow (complete)

- [x] `confirmBooking` server action at `src/app/[username]/[slug]/actions.ts`: anonymous, server-re-resolved (never a client-trusted host or event-type id), with the load-bearing operation order validate, re-resolve via `resolvePublicEventType`, live re-check via `getAvailableSlots`, claim via `createBooking` (surfacing `BookingConflictError` as the conflict path and creating no event), then best-effort Google event, then store refs. Both external calls injected (default real, tests stub).
- [x] Invitee form in `booking-picker.tsx` (name, email, optional note) shown after a slot is selected; the in-place result states (success confirmation with the Meet link, conflict and unavailable with a slot-refreshing "choose another time" control, inline validation errors, not-bookable notice). No separate confirmation route, no booking id in the URL.
- [x] `createEvent` on the Google provider gains `sendUpdates`, called with `sendUpdates: "all"` so Google delivers the invitee its own calendar invite and Meet link; `CalendarEvent` gains `htmlLink`. `updateBookingGoogleRefs` persists the event id, html link, and Meet link.
- [x] Migration 0004 adds the nullable `google_html_link` and `meet_link` columns to `bookings` (the `google_event_id` column shipped in 0003). Clean additive `ADD COLUMN`; the exclusion constraint untouched.
- [x] 8 integration tests at `tests/lib/booking/confirm-booking.test.ts` with both external calls stubbed (happy path, conflict, unavailable, Google failure, validation, not bookable). The real Google booking is verified manually against a connected calendar.
- A best-effort Google failure leaves the booking confirmed with null refs and still returns success; the accepted residual external TOCTOU and the no-rate-limiting follow-up are documented in `CALENDAR-PLAYBOOK.md` § Booking write flow.

### Phase 4e: front door, share links, and closeout (complete)

- [x] Root front door: `/` redirects to `/settings` (`src/app/page.tsx`), replacing the placeholder homepage. An authenticated host lands in the app; an unauthenticated visitor follows the existing SSO bounce once the proxy gates `/settings`. A friendlier public landing page and the public profile `/[username]` listing a user's bookable event types are deferred (not part of this PR).
- [x] Host-facing share link: each event type on `/settings/event-types` shows its full public booking URL with a copy-to-clipboard button (`copy-link.tsx`), built by `publicBookingUrl(username, slug)` in `src/lib/app-url.ts` (via `getAppOrigin()`, never a hardcoded host). Read-only display plus copy; no slug editing here. URL-builder unit tests added.
- [x] `username` unique: migration 0005 adds the case-insensitive `noclucal_users_username_unique` index now that the public resolver looks a host up by `username`. Drizzle-generated (`uniqueIndex` on the schema), a clean `CREATE UNIQUE INDEX`; no duplicate usernames existed; the hand-managed `bookings_no_overlap_per_host` exclusion constraint is untouched (confirmed by a no-op second `db:generate`).
- [x] Confirmation copy names the invitee email ("A calendar invitation has been sent to <email>") via a new `inviteeEmail` field on `BookingConfirmation`, replacing the vague "your email". No self-booking detection; the line is accurate for every real invitee.
- [x] CLAUDE.md trimmed back under its 40,000-char budget (the redundant 4d new-column note removed; the schema-file pointer already covers those columns), status to Phase 4 complete, and the `username`-is-unique note added. Routing, copy button, and confirmation copy verified manually. (Branded email confirmations and reminders remain Phase 5.)

## Phase 5: Booking confirmation and reminders

Builds the notification layer on the Redis and BullMQ substrate. Split into 5a
(queue infrastructure), 5b (Resend plus the confirmation email template), 5c
(wire the confirmation send through a queued job), 5d (scheduled reminders), and
5e (rate limiting plus closeout), mirroring how Phases 2 to 4 were split.

**Decision: Redis runs as a dedicated container on the droplet, not managed.**
The droplet already runs the compose stack; BullMQ job data here is not
safety-critical (the `bookings` table is the source of truth, the confirmation
send is best-effort, and reminders can be re-derived from bookings); and a
container gives clean isolation, dev parity, and zero added cost. It is not
shared with portalNetwork's Redis. Runs with `--maxmemory-policy noeviction`
(BullMQ stores job state as ordinary keys, so any eviction would silently drop
jobs) and `--appendonly yes` (a droplet restart keeps delayed jobs) in every
environment.

### Phase 5a: Redis and BullMQ infrastructure (complete)

- [x] Lazy, side-effect-free Redis connection module at `src/lib/queue/connection.ts` (mirrors `src/lib/db/index.ts`): a fresh connection per Worker, a memoized shared connection for producers, `maxRetriesPerRequest: null` on all, and a clear throw on a missing `REDIS_URL` at first use.
- [x] Queue constants and the notifications-queue producer handle (`src/lib/queue/constants.ts`, `src/lib/queue/queues.ts`) namespaced under the `noclucal` key prefix.
- [x] Worker scaffold (`src/lib/queue/worker.ts`) and the worker process entry (`src/worker.ts`) with `ready` / `failed` / `error` logging and graceful SIGTERM / SIGINT shutdown. A single trivial `health` job proves the round trip in tests; no real job types.
- [x] `redis:smoke` diagnostic script (`scripts/redis-smoke-test.ts`), the Redis analogue of `db:smoke`.
- [x] Redis services in dev (`docker-compose.dev.yml`, host port 6380) and prod (`docker-compose.yml`, compose-network only), both with `noeviction` and `appendonly`. A dedicated `worker` compose service runs `src/worker.ts` via tsx on a new `worker` Dockerfile stage between `migrator` and `runner` (so `runner` stays the default target). The `web` service gains `REDIS_URL` and `depends_on: redis`.
- [x] CI gains a `redis:7.4-alpine` service container and a job-level `REDIS_URL` for the queue round-trip test. `deploy.yml` is unchanged (`docker compose up -d --build` brings up the new services and builds the `worker` stage).
- [x] Dependencies: `bullmq` and `ioredis` added exact; `tsx` moved to a regular dependency exact (the worker needs it at runtime in the production image). Two queue tests (connection PING, enqueue-to-process round trip with full cleanup).
- Required ops step on merge: add `REDIS_URL=redis://redis:6379` to the droplet `/opt/noclucal/.env`, the same pattern as `TOKEN_ENCRYPTION_KEY` in Phase 2d.

Between 5a and 5b (2026-06-11): the infra reference layer landed. A docs-only PR added `INFRA-PLAYBOOK.md`, relocating the deep infrastructure and operations rationale out of CLAUDE.md; no phase status changed.

### Phase 5b: Resend and the confirmation email (complete)

- [x] Lazy, server-only Resend client at `src/lib/email/client.ts`, mirroring the DB and queue modules: zero import side effects, `RESEND_API_KEY` and `EMAIL_FROM` read on first use with a clear throw when missing, the `Resend` instance memoized, and `import "server-only"` keeping the key out of client bundles.
- [x] React Email confirmation template (branded, noClu voice) at `src/emails/booking-confirmation.tsx`: inline styles, single column, the Indigo Signal tokens from `globals.css`, the start instant rendered in the invitee timezone via the new `formatInstantForEmail` Luxon helper at `src/lib/email/format.ts` (no reusable formatter existed; the picker's formatting is inline in a `"use client"` component), the duration, the Meet link as a pill button when present, and the optional invitee note. The branded email complements Google's own calendar invitation; no reschedule or cancel actions yet (Phase 6).
- [x] `sendConfirmationEmail` at `src/lib/email/send-confirmation.ts` (server-only): renders the template and sends through Resend, returning the Resend result as-is and letting errors propagate (the best-effort policy belongs to the 5c caller).
- [x] Dependencies pinned exact: `resend` 6.12.4, `@react-email/components` 1.0.12, `@react-email/render` 2.0.8, `server-only` 0.0.1. The optional `react-email` preview CLI was skipped (heavy dev-server toolchain). `.env.example` documents `RESEND_API_KEY` and `EMAIL_FROM`.
- [x] Tests with the `resend` SDK mocked (no network, no real key): the client env guards, the template render assertions including the formatted local time, and the send-function payload and error-propagation cases.
- Deliberately unwired: nothing in the booking flow or the worker calls `sendConfirmationEmail`, and the queue and worker modules are untouched. Phase 5c wires the send through a queued job. Bounce and complaint handling moved out of 5b; it needs Resend webhooks and belongs with the wiring arc, not the unwired capability.
- Whether the booking record should persist the invitee timezone (the send function takes it as a parameter) is a 5c planning question.

### Phase 5c: wire the confirmation through a queued job (planned)

- [ ] Enqueue a confirmation job from `confirmBooking` and send the branded email from the worker, replacing reliance on Google's own invite as the only confirmation.

### Phase 5d: scheduled reminders (planned)

- [ ] BullMQ delayed jobs: send a 24h and a 1h reminder, scheduled at booking time and cancellable on cancel / reschedule.
- [ ] React Email reminder template.

### Phase 5e: rate limiting and closeout (planned)

- [ ] Redis-backed rate limiting on the public booking and confirm paths.
- [ ] React Email cancellation and reschedule-notification templates (sent by Phase 6).
- Note: auto-creating the Google Meet link via the `conferenceData` API already shipped in Phase 4d (the `confirmBooking` write-back creates the event with a Meet link and `sendUpdates: "all"`), so it is not Phase 5 work.

## Phase 6: Reschedule and cancel

- [ ] Signed reschedule and cancel URLs in confirmation emails (HMAC over `booking_id` + action + expiry).
- [ ] Reschedule UI: pick new slot from the same event type.
- [ ] Cancel UI: optional reason input; notification email to host.
- [ ] Webhook fires on cancel and reschedule for future automation integrations.

---

## Future horizons

These are not committed phases. They sketch directions noCluCal could go.

### Microsoft 365 calendar provider

A second `CalendarProvider` implementation backed by Microsoft Graph. Webhook subscriptions work similarly to Google. Adds Outlook and Teams users without changing the booking core.

### CalDAV provider

Covers iCloud, Fastmail, and self-hosted setups. Polling-based (no webhooks); shorter cache TTL.

### First-party noClu calendar

A native calendar product inside the noClu suite. Storage in noCluCal's own DB. The point is not to compete with Google Calendar at general purpose; the point is to offer scheduling-native features that external calendars cannot: per-event-type defaults, automatic availability inference from booking patterns, suite-wide "do not book during portalNetwork events," and so on.

### Payments

Stripe Checkout integration. Per-event-type pricing. Optional deposits. Refund and dispute handling tied to cancel events.

### Team scheduling

Multiple hosts on one event type. Round-robin distribution, collective availability (all hosts must be free), or fixed primary with backup.

### portalNetwork bridge

A bookable event type that requires an Authenticity Score above a threshold, or that costs $IOC. The first cross-product integration in the noClu suite.

### Workflow automation

Pre and post-booking actions: send Slack message, create Notion page, fire webhook, send SMS. Initially a fixed library; eventually user-configurable.

---

## Deferred items

- **Session revocation gap.** noCluCal trusts the noclulabs-signed JWT until natural expiry. A revoked noclulabs session (password change, account deletion) remains valid in noCluCal until the JWT expires (Auth.js default 30 days). Closing the gap requires either a `/api/auth/validate-session` endpoint on noclulabs that noCluCal pings on session resolution (with caching), or promoting noclulabs to a proper OIDC provider with token introspection. Revisit when there are real users in noCluCal.
- **Redirect sanitizer extension.** noclulabs' `sanitizeRedirect` currently rejects any non-same-origin path. The SSO sign-in redirect from cal.noclulabs.com needs `cal.noclulabs.com` (and future suite domains) to be allowed targets. A suite-aware sanitizer lives at the noclulabs side and lists permitted domains explicitly. Phase 1 of noCluCal will require a coordinated PR against noclulabs.com to add this.
- **CALENDAR-PLAYBOOK.md.** Resolved (2026-06-04). Added as a read-on-demand reference layer (not a bible file) when CLAUDE.md crossed the 40,000-char context budget. It holds the deep per-feature design rationale for the booking core (calendar internals, slot computation, event types, availability); CLAUDE.md keeps a summary plus a pointer per section. The bible set stays at four; future reference files split by durable domain (e.g. an `AUTH-PLAYBOOK.md`), never by phase.
- **Redis-backed slot holds.** Originally planned as Phase 4b, a short-TTL hold (Redis key, not a `bookings` row) so two invitees racing on the same slot do not both reach the confirm step. Deferred out of the committed Phase 4 plan because the 4a exclusion constraint is the hard floor against double bookings and 4b's live freebusy read plus internal-booking union is the optimization layer above it; a hold only narrows the race window further. Revisit if real-world contention shows the freebusy-plus-constraint pair is not enough. (Redis and BullMQ themselves landed in Phase 5a, so a hold would no longer need to bring them; it is a small, self-contained add on top of the existing substrate.)
- **Webhook subscriptions for Google Calendar.** Push notifications via the watch channel API require BullMQ for renewal (channels expire at 7 days max). BullMQ and Redis landed in Phase 5a, so the substrate is no longer the blocker; webhook support is still deferred on its own merits. When it ships, it adds a separate extension interface (e.g. `WebhookCapableProvider`) alongside `CalendarProvider`, plus a BullMQ recurring job that renews channels on a daily cadence. Until webhooks ship, freebusy is read synchronously on demand (no cache; no invalidation needed).
