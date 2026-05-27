# Roadmap

Version targets and planned work for noCluCal.

---

## Status snapshot

- Phase 0 (Bible seeding): complete (2026-05-26).
- Phase 1a (foundation scaffold and CI/CD chain): complete (2026-05-26). Next.js 16 scaffold, Tailwind v4, Vitest harness, multi-stage Dockerfile, GitHub Actions CI and Deploy. Site live at https://cal.noclulabs.com with the placeholder homepage.
- Phase 1b (database wiring): complete (2026-05-26). Drizzle + `pg` connection module at `src/lib/db/index.ts` (lazy-init, max 10 pool, libpqcompat documented), `docker-compose.dev.yml` for local Postgres 18 on host port 5434, `pnpm db:smoke` validates connectivity. No schema yet.
- Phase 1c (migrator stage and first schema): ready. Migrator Docker stage, `migrate` Compose profile, CI Postgres service container, first migration creating `noclucal_users`, `calendar_connections`, `event_types`, `availability_rules`, `bookings`.

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

### Phase 1c: migrator stage, deploy migrate profile, and first schema

- [ ] First Drizzle schema files in `src/lib/db/schema/`: `noclucal_users` shadow table (id + cached username + display_name), `calendar_connections` (polymorphic, encrypted token storage), `event_types`, `availability_rules`, `bookings`. Uuidv7 PKs, citext where appropriate, soft-delete via `deleted_at`.
- [ ] `noclucal_users` projection write helper: on first observation of a user (any authenticated request where the user_id is not yet in `noclucal_users`), insert a row with cached username and display_name.
- [ ] Refactor `src/lib/db/index.ts` to pass the schema into `drizzle(pool, { schema })` and re-export it so callers get typed `db.query.<table>` accessors.
- [ ] First migration generated via `pnpm db:generate` and committed under `drizzle/migrations/`.
- [ ] Add migrator Dockerfile stage mirroring noclulabs.
- [ ] Add `migrate` profile to `docker-compose.yml`.
- [ ] Extend `ci.yml` with a Postgres 18 service container and `pnpm db:test:setup` before `pnpm test`.
- [ ] Extend `deploy.yml` to run `docker compose run migrate` before rebuilding the web container.

### Phase 1d: Auth.js v5 SSO-RP mode

- [ ] `auth.config.ts` (edge-safe, augmentations match noclulabs' JWT shape exactly), `auth.ts` (no providers), `proxy.ts` (Next.js 16 replacement for middleware; redirects unauthenticated visitors to `noclulabs.com/signin?redirect=...`).
- [ ] Cookie domain `.noclulabs.com`. Shared `AUTH_SECRET` documented in `.env.example` with explicit note that it MUST match noclulabs' value.
- [ ] First integration test: verify the SSO bridge accepts a JWT signed by noclulabs' `AUTH_SECRET` and rejects one signed by a different secret.

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
