# Roadmap

Version targets and planned work for noCluCal.

---

## Status snapshot

- Phase 0 (Bible seeding): in flight. This PR creates the four canonical bible files plus a standard `.gitignore`. Captures all architectural decisions made in the architect/executor design session. No code in this PR.

---

## Phase 0: Bible seeding (in flight)

- [ ] Create `CLAUDE.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md` at repo root.
- [ ] Create `.gitignore` (standard Node + Next.js + .env*).
- [ ] Capture architectural decisions: stack, SSO bridge to noclulabs, separate database in shared DO Managed Postgres cluster, `CalendarProvider` interface, deployment shape mirroring noclulabs and portalNetwork.
- [ ] No code, no `package.json`, no scaffold.

## Phase 1: Repo scaffold

Sets up the Next.js 16 + Drizzle + Auth.js skeleton with the SSO bridge wired and the production deploy path validated end-to-end. This is the longest phase by PR count; expect a multi-prompt arc.

- [ ] Next.js 16 App Router scaffold with `output: "standalone"`, TypeScript strict, Tailwind v4, ESLint, ESLint Next config, Vitest harness.
- [ ] Drizzle ORM + `pg` driver. `src/lib/db/` connection module mirroring noclulabs (lazy init, max 10 pool, libpqcompat suffix verified).
- [ ] First Drizzle migration: `noclucal_users` shadow table (id + cached username + display_name), `calendar_connections` (polymorphic, encrypted token storage), `event_types`, `availability_rules`, `bookings`. Uuidv7 PKs, citext where appropriate, soft-delete via `deleted_at`.
- [ ] Auth.js v5 in SSO-RP mode: `auth.config.ts` (edge-safe, augmentations match noclulabs' JWT shape exactly), `auth.ts` (no providers), `proxy.ts` (Next.js 16 replacement for middleware; redirects unauthenticated visitors to `noclulabs.com/signin?redirect=...`).
- [ ] Cookie domain `.noclulabs.com`. Shared `AUTH_SECRET` documented in `.env.example` with explicit note that it MUST match noclulabs' value.
- [ ] Multi-stage Dockerfile (deps / build / runner / migrator stages, mirroring noclulabs).
- [ ] `docker-compose.yml` with `migrate` profile. `docker-compose.dev.yml` for local Postgres on host port 5434 (avoid clash with noclulabs' 5433).
- [ ] GitHub Actions `ci.yml` and `deploy.yml`, mirroring noclulabs with the `migrate` profile invocation.
- [ ] Caddy reverse proxy config for `cal.noclulabs.com` (documented in README; deployed manually to droplet during Phase 1 ops).
- [ ] First integration test: verify the SSO bridge accepts a JWT signed by noclulabs' `AUTH_SECRET` and rejects one signed by a different secret.
- [ ] `noclucal_users` projection write helper: on first observation of a user (any authenticated request where the user_id is not yet in `noclucal_users`), insert a row with cached username and display_name.

## Phase 2: Google Calendar provider

Implements the `CalendarProvider` interface and ships the first provider end to end. No booking UI yet; just the connect / disconnect flow plus busy-time reads.

- [ ] `CalendarProvider` interface at `src/lib/calendar/types.ts`.
- [ ] `GoogleCalendarProvider` implementation at `src/lib/calendar/providers/google.ts`.
- [ ] OAuth 2.0 consent flow: connect, refresh, disconnect. Tokens encrypted at rest.
- [ ] Provider registry at `src/lib/calendar/providers/index.ts`.
- [ ] `/settings/calendars` page for connecting and disconnecting calendars.
- [ ] Webhook endpoint for Google's calendar change notifications. BullMQ job for push channel renewal (Google watch channels expire after 7 days max).

## Phase 3: Event types and availability

- [ ] `event_types` CRUD: name, slug, duration, buffer-before, buffer-after, min-notice, max-future, color.
- [ ] `availability_rules`: weekday hours per timezone, date overrides (holidays, one-offs).
- [ ] Slot computation: given event type + connected calendars + availability rules + invitee timezone, return a list of bookable slots. Pure function, exhaustively unit-tested with timezone edge cases (DST forward, DST backward, IDL crossings).
- [ ] `/settings/event-types` page for managing event types.
- [ ] `/settings/availability` page for managing availability rules.

## Phase 4: Public booking page

- [ ] `/[username]` public profile (reuses the noclulabs username) listing the user's bookable event types.
- [ ] `/[username]/[event-type-slug]` booking page: slot grid, timezone picker, intake form.
- [ ] Slot-hold mechanism via Redis (30-second TTL) to prevent double-booking. DB-level unique constraint on `(host_user_id, starts_at)` as belt-and-suspenders.
- [ ] `bookings` table with confirmation lifecycle (`held` -> `confirmed` -> `cancelled` / `completed`).

## Phase 5: Booking confirmation and reminders

- [ ] BullMQ workers: send confirmation email, send 24h reminder, send 1h reminder.
- [ ] React Email templates: confirmation, reminder, cancellation, reschedule notification.
- [ ] Resend integration with bounce and complaint handling.
- [ ] Auto-create Google Meet link on the Google Calendar event via the `conferenceData` API.

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
- **CALENDAR-PLAYBOOK.md.** If a content-style or workflow-style reference emerges (analogous to noclulabs' ANIMATION-PLAYBOOK.md, e.g. for event-type templates or calendar provider recipes), add it as the fifth bible file at that time.
