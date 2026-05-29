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

### Phase 2d: OAuth routes, connect/disconnect actions, `/settings/calendars` page

- [ ] Google Cloud Console OAuth client provisioned (manual ops; documented in the PR body or in `docs/ops/google-oauth.md` if it warrants permanence). Authorized redirect URIs: `https://cal.noclulabs.com/api/calendar/google/callback` and `http://localhost:3000/api/calendar/google/callback`. Client id and secret stored in Bitwarden and on the droplet `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- [ ] `GET /api/calendar/google/connect` route: signed state, redirect to `buildAuthorizationUrl`.
- [ ] `GET /api/calendar/google/callback` route: validate state, call `exchangeCode`, encrypt tokens via `encryptToken`, upsert `calendar_connections` row (DELETE-then-INSERT to honor the unique constraint cleanly), redirect to `/settings/calendars`.
- [ ] `POST /api/calendar/google/disconnect` server action: load the row, call `provider.revoke`, DELETE the row.
- [ ] `/settings/calendars` page lists the connected Google account (or "connect" CTA), shows the connected email, offers disconnect. `proxy.ts` matcher extended to protect `/settings/*`.
- [ ] Refresh token handling: a thin wrapper that calls `refreshAccessToken` when `tokenExpiresAt` is within a 60s safety margin of now, re-encrypts via `encryptToken`, and persists the new token set. On refresh failure, DELETE the row and surface a "reconnect required" UI state.
- [ ] `TOKEN_ENCRYPTION_KEY` must be on the droplet's `/opt/noclucal/.env` before this PR's deploy (the crypto helpers are first invoked at runtime here).

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
- **Webhook subscriptions for Google Calendar.** Push notifications via the watch channel API require BullMQ for renewal (channels expire at 7 days max). Redis and BullMQ land in Phase 4 for slot holds; webhook support is deferred until then. When this ships, it adds a separate extension interface (e.g. `WebhookCapableProvider`) alongside `CalendarProvider`, plus a BullMQ recurring job that renews channels on a daily cadence. Until webhooks ship, freebusy is read synchronously on demand (no cache; no invalidation needed).
