# CLAUDE.md

> Project context file for Claude Code sessions. Read this file first, every session.

## Project Overview

**noCluCal** is a booking platform in the noClu suite. It lets visitors book time with noCluCal users through public booking pages, integrates with external calendars (Google first; Microsoft, CalDAV, and a first-party noClu calendar planned), and is the second product in the noClu suite after noclulabs.com. Identity is federated from noclulabs.com via a shared-cookie SSO bridge; noCluCal trusts inbound JWTs signed with the same `AUTH_SECRET` and never writes to noclulabs' users table.

- **Domain:** cal.noclulabs.com (subdomain of noclulabs.com for cookie-based SSO)
- **Repository:** github.com/noclulabs/noclucal
- **Hosting:** DigitalOcean Droplet (shared with noclulabs.com and portalNetwork; unique host port)
- **Status:** Phase 4 complete (2026-06-09); Phases 5a (Redis / BullMQ substrate), 5b (the branded confirmation email), and 5c (2026-06-12, the wiring; see § Email sending) shipped. End-to-end booking is live: a visitor picks a time on a host's public `/[username]/[slug]` page and confirms; the slot is claimed under the `bookings_no_overlap_per_host` exclusion constraint, then a best-effort Google event with a Meet link and an invitee invite is created, then the branded confirmation email goes out. Phase 5d (reminders), 5e (rate limiting), and Phase 6 (reschedule / cancel) follow; the optional Phase 3 live slot preview remains. Detail: ROADMAP.md and CHANGELOG.md; deep rationale: `CALENDAR-PLAYBOOK.md` (booking core) and `INFRA-PLAYBOOK.md` (infrastructure and operations).

## Bible files (canonical set)

Four files are the continuity mechanism across architect sessions: every prompt reads them at ramp-up and every PR updates the ones it affects. The set is intentionally small; more files mean faster drift.

| File | When updated | Owns |
|------|-------------|------|
| CLAUDE.md | Per-PR when a change has architectural significance, when a new pattern is established, or when a deferred item surfaces | Project context, stack, conventions, current state, design rationale, file structure, gotchas, lessons learned |
| CHANGELOG.md | Every PR, no exceptions | Change log entries in conventional commit format under [Unreleased] / Added / Changed / Fixed / Removed |
| ROADMAP.md | Per-PR when phase status changes, when a future arc gets fleshed out, or when a deferred item is logged or resolved | Version targets, planned work, completed phase history, future arcs, deferred items, known minor issues |
| README.md | When user-facing features change, when setup changes, when the public feature list needs updating | Public-facing setup, project structure, feature list, deployment notes |

### Reference layer (not bible files)

Two read-on-demand reference files sit beside the bibles, split by durable domain: `CALENDAR-PLAYBOOK.md` holds the deep booking-core rationale (calendar internals, slot computation, event types, availability) and is read at ramp-up only for booking-core PRs; `INFRA-PLAYBOOK.md` holds the deep infrastructure and operations rationale (Docker, compose, Redis and BullMQ, the worker, deploy, CI, the droplet env, dependency coupling) and is read only for infrastructure, deployment, and operations PRs. The rule that keeps CLAUDE.md bounded: it keeps current state, active conventions, and gotchas that bite the next session, summarizing deep rationale to a few lines plus a pointer into the right playbook (append-mostly, so growth costs nothing per session and creates no sync drift). Split reference files by durable domain, not by phase, adding a new one only when a domain outgrows a lean summary (one-file-per-phase causes drift). The bible set stays the four files above; the playbooks do not grow it.

### Ramp-up and per-PR rules

Every architect-generated executor prompt MUST list all four bible files in its ramp-up reads; omitting one is a defect the architect corrects. Every PR's done-definition includes a "Bible file updates (REQUIRED)" section listing the bibles it modifies with the specific edits, or explicitly notes "no bible changes" with the reason (rare; pure refactors with no observable behavior change only).

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Font:** Space Grotesk (inherited from noclulabs design system, via `next/font/google`)
- **Database:** PostgreSQL 18 via Drizzle ORM with the `pg` driver
- **Caching and queues:** Redis with BullMQ for rate limiting and background jobs (confirmation email, reminders, OAuth token refresh, webhook processing). Substrate deployed in Phase 5a; the first real job (the confirmation email) wired in 5c
- **Auth:** Auth.js v5 (`next-auth@beta`) in SSO relying-party mode (see § Identity bridge)
- **Time and timezones:** Luxon (IANA tz support, RRULE helpers; chosen over date-fns-tz for the recurrence story)
- **Email:** Resend with React Email templates
- **Calendar SDKs:** `googleapis` for Google Calendar. Additional providers wired through the `CalendarProvider` interface.
- **Validation:** Zod
- **Package manager:** pnpm
- **Linting:** ESLint (Prettier deferred, matching noclulabs)
- **Testing:** Vitest (unit + integration). Playwright is reserved for E2E if and when needed.
- **CI:** GitHub Actions
- **CD:** GitHub Actions auto-deploys on every merge to `main`
- **Deployment:** Docker on a DigitalOcean Droplet behind a Caddy reverse proxy

## Brand System

The noClu design system is defined in `noclulabs.com/docs/noclu-brand-style-guide.md` (sibling repo on the same Mac). noCluCal inherits all visual decisions from that document. Key points:

- **Dark mode first.** Canvas background: `#0e1117`. No light mode at launch.
- **Color palette:** Indigo Signal. Primary: `#818cf8`. Secondary: `#a5f3fc`.
- **Typography:** Space Grotesk exclusively. Weights 400, 500, 600, 700.
- **Corner radius:** Pill shape (`999px`) for interactive elements. `20px` for cards. `12px` for code/media.
- **Borders:** 1.5px on interactive elements. Borderless on content cards (use surface color for separation).
- **Elevation:** Background color shifts only (`canvas` > `surface` > `surface-elevated`). No box shadows as primary elevation.
- **Voice:** Minimal. Let the work speak. No exclamation marks. No marketing superlatives.

Tokens are duplicated into noCluCal's `globals.css` (shipped in Phase 1a) rather than imported from noclulabs, to avoid runtime coupling. When tokens change in the brand style guide, both repos update in lockstep.

## Identity bridge (SSO with noclulabs.com)

noCluCal is a relying party to noclulabs.com's identity. Mechanics:

- **Cookie domain.** Auth.js writes its session cookie with `Domain=.noclulabs.com` (parent domain), so the cookie is visible to every subdomain in the noClu suite. noclulabs.com sets the cookie at sign-in; noCluCal reads it.
- **Shared AUTH_SECRET.** Both apps share the same `AUTH_SECRET` (managed in Bitwarden under the noClu Infrastructure folder). This lets noCluCal verify the JWT signature locally without an HTTP round-trip to noclulabs.
- **JWT shape.** Mirrors noclulabs exactly: `{ id, username, role: "user" | "admin", signedInAt: number }`. noCluCal augments `Session["user"]` and `JWT` with the same module declarations in its own `auth.config.ts`. If the shape changes in noclulabs, noCluCal must follow in lockstep.
- **No providers in noCluCal.** noCluCal does NOT run Credentials, OAuth, or any sign-in flow of its own. The Auth.js providers array is empty. All authentication happens at noclulabs.com/signin.
- **Sign-in redirect.** When an unauthenticated visitor hits a protected page on cal.noclulabs.com, the proxy redirects to `https://noclulabs.com/signin?redirect=https://cal.noclulabs.com/<original-path>` (URL-encoded). noclulabs.com's existing same-origin redirect sanitizer was extended in noclulabs PR #143 to allow `cal.noclulabs.com` (and future suite domains) as trusted targets. Cookie domain was also widened to `.noclulabs.com` at that time.
- **No DB writes to noclulabs.** noCluCal NEVER writes to noclulabs' users table. References to users are by external user ID only, stored in noCluCal's own `noclucal_users` shadow table (a lightweight projection: user_id PK plus cached `username` / `display_name` for joins, updated lazily on first observation of each user).
- **Session revocation deferred.** noclulabs revokes sessions on password change via its `signedInAt < password_changed_at` check; noCluCal does not replicate it (that would need a DB lookup against noclulabs or an HTTP round-trip per render), so a revoked noclulabs session stays valid here until the JWT expires (Auth.js default 30 days). The options for closing the gap are logged in ROADMAP § Deferred items.

## File Structure

A top-level orientation map, not an exhaustive listing; run `git ls-files` for
the always-current full set. A PR updates this map only when it adds a new
top-level area, never for every new file (the source files own the detail).

- **`src/lib/`** is the domain core, one subdirectory per area:
  - `db/` Drizzle schema (one file per table), lazy pool / client, schema barrel.
  - `calendar/` the `CalendarProvider` abstraction, Google provider, token crypto, connection store, OAuth state.
  - `scheduling/` the pure `computeSlots` engine, interval helpers, types.
  - `event-types/` config, Zod validation, color palette, data-access.
  - `availability/` weekly rules, date overrides, timezone validation, queries.
  - `booking/` the `getAvailableSlots` orchestration over `computeSlots`, plus public-route resolution (`resolve.ts`).
  - `bookings/` confirmed-booking records, constants, data-access.
  - `auth/` the lazy `noclucal_users` upsert; plus top-level helpers (`app-url.ts`, `version.ts`).
  - `queue/` (Phase 5a) the lazy Redis connection, BullMQ queue constants and the producer handle, and the worker scaffold.
  - `email/` (Phase 5b, wired in 5c) the lazy Resend client, the `sendConfirmationEmail` send function, and the email-facing Luxon formatter.
- **`src/emails/`** React Email templates (the Phase 5b booking confirmation), rendered server-side by `src/lib/email/`.
- **`src/worker.ts`** the BullMQ worker process entry, run via tsx in the `worker` container (see § Infrastructure and deployment).
- **`src/app/`** the App Router tree: root layout / page / `globals.css`, `me/`, `api/` (Auth.js handler, Google OAuth connect / callback), `settings/` (the shell `layout.tsx`, `settings-nav.tsx`, the `/settings` overview, and the event-types, availability, calendars, and bookings-placeholder sections, each a page plus server `actions.ts`), and the public booking page at `[username]/[slug]/` (the dynamic, anonymous `page.tsx` plus the `booking-picker.tsx` client component, outside the auth matcher).
- **`src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`** the Auth.js relying-party wiring: server, edge-safe, route-protecting proxy (see § Auth).
- **`tests/`** mirrors `src/` (Vitest), plus `setup.ts` and top-level `smoke.test.ts`.
- **`drizzle/migrations/`** the numbered SQL migrations and Drizzle's `meta/` journal.
- **`scripts/`** DB smoke-test and CI test-setup; **`public/`** static assets; **`.github/workflows/`** CI and deploy pipelines.
- **Root** the build and tooling config (`package.json`, `tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, ESLint / PostCSS config, `Dockerfile` and Compose files, `.env.example`).
- **Bible set:** CLAUDE.md, README.md, ROADMAP.md, CHANGELOG.md. **Reference layer:** CALENDAR-PLAYBOOK.md (read-on-demand booking-core rationale) and INFRA-PLAYBOOK.md (read-on-demand infrastructure and operations rationale).

Per-phase file and dependency history lives in CHANGELOG.md and ROADMAP.md, not here.

## Infrastructure and deployment

Live at https://cal.noclulabs.com (host port 3002 behind Caddy; portalNetwork holds 3000, noclulabs 3001), cloned to `/opt/noclucal` with its own `.env`. One terse line per invariant below; the rationale, the failure history, and the dependency-coupling rule live in `INFRA-PLAYBOOK.md`, read at ramp-up for infrastructure, deployment, and operations PRs.

- `runner` stays the last Dockerfile stage (`deps`, `build`, `migrator`, `worker`, `runner`): the `web` compose service sets no `target:`, so Docker builds the last stage.
- Redis runs `--maxmemory-policy noeviction` and `--appendonly yes` in dev and prod; every BullMQ key is prefixed `noclucal`.
- The queue connection module is lazy and side-effect-free like the DB module, with `maxRetriesPerRequest: null` on every connection, and the Worker takes its own connection while producers share a memoized one.
- The worker is its own compose service running `src/worker.ts` via tsx (`@/` resolves from `tsconfig.json` unbundled) with graceful SIGTERM / SIGINT shutdown.
- The droplet `/opt/noclucal/.env` holds config and secrets, each new key added before or with the deploy that needs it (`TOKEN_ENCRYPTION_KEY`, `REDIS_URL`; `RESEND_API_KEY` and `EMAIL_FROM` as of 5c).
- Deploy is `deploy.yml` on merge to `main`: `git pull`, the `migrate` Compose profile, `docker compose up -d --build`, prune.

## Conventions

### Code Style

- TypeScript strict mode. No `any` types. No `@ts-ignore`.
- Functional components only. No class components.
- Named exports for components. Default export only for page/layout files.
- Props interfaces defined inline or co-located with the component.
- Path aliases: `@/` maps to `src/`.
- File naming: kebab-case for files, PascalCase for components.
- CSS custom properties defined in `globals.css` using the tokens from the brand style guide.
- Tailwind classes use the project's custom theme tokens, not arbitrary values.
- **Drizzle schema-glob hazard.** drizzle-kit picks up any `*.ts` file in `src/lib/db/schema/` regardless of git tracking. A scratch file or stray copy in that directory will get baked into the next generated migration. Always confirm the schema directory contains only intended files before running `pnpm db:generate`.
- **Hand-managed EXCLUDE constraint.** The `bookings_no_overlap_per_host` exclusion constraint (and its `btree_gist` extension) is hand-added in migration 0003; Drizzle does not model `EXCLUDE`, so `pnpm db:generate` neither creates nor sees it (confirmed: it emits no drop). Never let a future migration drop it; re-add it by hand if the table is ever regenerated.

### Dependencies

- **Pinning.** Shared dependencies (for example `zod`, `next-auth`, `drizzle-orm`) match noclulabs' pin style for cross-suite consistency; noClu-specific dependencies (for example `luxon`, `googleapis`) pin exact. Either way the lockfile (`pnpm-lock.yaml`) is authoritative for reproducible installs. When bumping `bullmq`, realign the `ioredis` pin to the version `bullmq` resolves (`INFRA-PLAYBOOK.md` § Dependency coupling).

### Writing Style

- Never use em dashes in any content. Use commas, periods, or parentheses instead.
- Sentence case for all headings and labels.
- No emoji in UI or copy.
- No exclamation marks.
- Minimal copy. If it can be cut, cut it.

### Git Conventions

- Conventional commits: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore, ci, perf
- Branch naming: `type/short-description` (e.g., `feat/google-calendar-oauth`, `fix/slot-collision`)
- Squash merge to main.
- Tag releases: `vX.Y.Z`.

### Bible File Updates

Every Claude Code session must end by updating the relevant bible files:

- **CLAUDE.md** if the file structure, conventions, or stack changed
- **CHANGELOG.md** with all changes made in the session
- **ROADMAP.md** to reflect completed work and any new planned items
- **README.md** if setup instructions or project description changed

## Database

- **Cluster.** Same DigitalOcean Managed Postgres cluster as noclulabs (`noclulabs-postgres-prod`, Basic tier, PostgreSQL 18, SFO2, in the noCluHub VPC).
- **Databases.** `noclucal_dev` (local Mac via `docker-compose.dev.yml`, host port 5434), `noclucal_test` (CI service container, ephemeral), `noclucal_prod` (DO managed cluster, provisioned 2026-05-26); separate databases, not schemas (`INFRA-PLAYBOOK.md` § Database operations).
- **Connection module.** `src/lib/db/index.ts` exports `pool`, `db`, `closeDb()`, and re-exports `schema`. Lazy init via a Proxy: importing the module has zero side effects, the `Pool` and Drizzle client are constructed on first property access, and an unset `DATABASE_URL` throws at that point (load-bearing for the Next.js build; same reason as the queue module, `INFRA-PLAYBOOK.md` § Lazy, side-effect-free connections). Pool config: max 10 connections, 30s idle, 5s connect. Mirrors noclulabs' Phase 3a pattern exactly.
- **Drizzle instance with schema.** `db = drizzle(getPool(), { schema })`, so `db.query.noclucalUsers` is typed. New tables added to `src/lib/db/schema/` show up automatically once their file is exported from `schema/index.ts`.
- **Smoke test.** `pnpm db:smoke` (`scripts/db-smoke-test.ts`) answers "is the database reachable right now?" without depending on any schema; `pnpm redis:smoke` is the Redis analogue. Detail in `INFRA-PLAYBOOK.md` § Smoke tests.
- **SSL workaround (critical).** Every `DATABASE_URL` used by node-pg / drizzle-orm / drizzle-kit MUST end with `&uselibpqcompat=true` (`psql` and local dev do not need the suffix). The why and the psql ops pattern: `INFRA-PLAYBOOK.md` § The libpqcompat SSL workaround.
- **Two-URL pattern.** Public URL for Mac ops, VPC URL for the droplet runtime, both in Bitwarden; detail in `INFRA-PLAYBOOK.md` § Database operations.
- **UUID PKs.** Postgres 18 native `uuidv7()` (time-ordered, no extension required). Not used yet by `noclucal_users` because the id comes from the noclulabs JWT, not from the DB.

### Schema

Design rationale for the booking-core tables (`event_types`, `host_settings`, `availability_rules`, `availability_overrides`) lives in CALENDAR-PLAYBOOK.md § Event types and availability storage.

- **`noclucal_users`** (Phase 1c). Shadow table projecting the authoritative users table that lives in the noclulabs DB. Pure-projection invariant: no FK to anything, noclulabs is the source of truth, and noCluCal never writes back. `id` has no default and is set from the noclulabs JWT (noCluCal does not generate user ids). `username` is `citext` (needs the citext extension, created in migration 0000) and unique (case-insensitive `noclucal_users_username_unique` index, migration 0005) now that the public route resolves a host by it. Rows are inserted lazily on first observation of each user via `src/lib/auth/upsert-noclucal-user.ts` (Phase 1d), which refreshes the cached `username` / `display_name` via `ON CONFLICT (id) DO UPDATE`. Full columns in `src/lib/db/schema/users.ts`.

- **`calendar_connections`** (Phase 2a). One row per OAuth-connected external calendar account; `user_id` FK to `noclucal_users.id` (cascade delete). Access and refresh tokens are encrypted at rest (ciphertext columns in `v1:base64nonce:base64ciphertext` format). Unique index on `(user_id, provider)` enforces one account per provider for the MVP. Full columns in `src/lib/db/schema/calendar-connections.ts`; full design in the calendar abstraction layer section.

- **`event_types`** (Phase 3a). Per-user bookable event type definitions; `user_id` FK to `noclucal_users.id` (cascade delete). Unique index `event_types_user_slug_unique` on `(user_id, slug)` makes the slug unique per host; a lookup index covers `(user_id)`. Full columns in `src/lib/db/schema/event-types.ts`.

- **`host_settings`** (Phase 3a). noCluCal-owned per-user scheduling config (currently the booking `timezone`), keyed 1:1 on `user_id` PK and FK to `noclucal_users.id` (cascade delete). It exists to hold host-owned config off the `noclucal_users` shadow table, keeping that table a pure projection. Full columns in `src/lib/db/schema/host-settings.ts`.

- **`availability_rules`** (Phase 3a). Recurring weekly availability windows, keyed on `user_id` directly (one schedule per host; no FK to `event_types`, no `schedule_id`). `user_id` FK cascade. Lookup indexes on `(user_id)` and `(user_id, weekday)`. Multiple rows per `(user_id, weekday)` are intentionally allowed (no unique constraint on the pair) so split days are first-class. CHECK constraints `availability_rules_weekday_range` (weekday between 1 and 7) and `availability_rules_time_order` (start < end). Full columns in `src/lib/db/schema/availability.ts`.

- **`availability_overrides`** (Phase 3a). Date-specific exceptions to the recurring schedule; `user_id` FK cascade. Lookup indexes on `(user_id)` and `(user_id, date)`. Multiple rows per `(user_id, date)` are intentionally allowed (no unique constraint on the pair) so split custom days are first-class. CHECK constraint `availability_overrides_shape` keeps the two modes mutually exclusive and well-formed: either a blocked day (`is_available = false` with null times) or a custom-hours day (`is_available = true` with non-null times and start < end). Full columns in `src/lib/db/schema/availability.ts`.

- **`bookings`** (Phase 4a). Immutable historical record of confirmed bookings. `event_type_id` FK to `event_types.id` is `ON DELETE SET NULL` (nullable) so history survives event-type deletion; `host_user_id` FK to `noclucal_users.id` (cascade). Snapshots `event_type_name` and `duration_minutes` at booking time so a row is self-describing (read the snapshot, do not join back through the FK). `status` is an app-level varchar(20) default `confirmed`, not a pg enum. Lookup indexes on `(host_user_id)`, `(host_user_id, starts_at)`, and `(event_type_id)`. The `bookings_no_overlap_per_host` exclusion constraint (`EXCLUDE USING gist (host_user_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE status = 'confirmed'`, needing `btree_gist`) makes two overlapping confirmed bookings for one host physically impossible; half-open `tstzrange` (so abutting bookings do not conflict); hand-added in migration 0003 (Drizzle does not model it, see § Conventions). Full columns (including the nullable Google write-back columns) in `src/lib/db/schema/bookings.ts`. Rationale in CALENDAR-PLAYBOOK.md § Booking model and § Booking write flow.

### Migrations

- **Workflow.** README § Migrations owns the steps. The gotcha: Drizzle does NOT auto-generate `CREATE EXTENSION`; hand-prepend it with a `--> statement-breakpoint` before the first dependent statement.
- **Statement breakpoints.** `--> statement-breakpoint` is Drizzle's convention for splitting one migration file into multiple SQL statements at runtime. Without it the file is one statement, and an extension-then-extension-column-type combo fails to apply.
- **Deploy.** Migrations apply against `noclucal_prod` on every merge via the `migrate` Compose profile, before the web rebuild; Drizzle's `__drizzle_migrations` table makes the run idempotent. For a migration that breaks the previous app code, flip the order for that deploy (build first, migrate second). Mechanics in `INFRA-PLAYBOOK.md` § Deploy mechanics.
- **CI.** `ci.yml` runs Postgres and Redis service containers, sets `DATABASE_URL` and `REDIS_URL` at the job level, and applies migrations via `pnpm db:test:setup` before the lint / type-check / test / build gate. Detail in `INFRA-PLAYBOOK.md` § CI.

## Auth

Auth.js v5 is wired in SSO relying-party mode as of Phase 1d. All authentication happens at noclulabs.com; noCluCal verifies the JWT noclulabs signed and propagates the session via `auth()`.

- **Config split.** Same edge-safe / server-only split as noclulabs: `src/auth.config.ts` (edge-safe, no `pg` / `drizzle` / `bcrypt` imports), `src/auth.ts` (extends, no providers since this is RP-only), `src/proxy.ts` (imports ONLY from `auth.config.ts`, replaces the Next.js 16 deprecated `middleware` convention). NEVER collapse to one file; the proxy compiles to the edge runtime and crashes if Node-only imports leak in.
- **No providers.** The Auth.js providers array is empty. Sign-in happens at noclulabs.com.
- **Cookie domain.** `cookies.sessionToken.options.domain = ".noclulabs.com"` in production (gated on `AUTH_URL` starting with `https://`). In dev the cookie stays host-only because browsers refuse parent-domain cookies on bare-host origins.
- **Cookie name prefix.** `__Secure-` prefix is applied in lockstep with `useSecureCookies`, matching noclulabs exactly so the same cookie is read on both sides.
- **JWT shape.** Mirrors noclulabs' augmentation: `{ id, username, role: "user" | "admin", signedInAt?: number, deviceId?: string }`. `signedInAt` and `deviceId` are read but never written here.
- **Session callback.** A pure pass-through that maps JWT fields onto `session.user`. No DB access, no mutation of the token.
- **Protected routes.** Listed in `src/proxy.ts`'s `config.matcher`. Unauthenticated visitors are redirected to `https://noclulabs.com/signin?redirect=<encoded original URL>`.
- **NextAuth handlers.** `src/app/api/auth/[...nextauth]/route.ts` re-exports `GET` and `POST` from `@/auth`. Required even in RP-only mode for the session endpoint.
- **Lazy upsert.** `src/lib/auth/upsert-noclucal-user.ts` performs an `INSERT ... ON CONFLICT (id) DO UPDATE` into `noclucal_users` on each authenticated page render. Best-effort: failures are logged but never break the render. Callers wrap in `try/catch`.
- **Env vars.** Same set as noclulabs: `AUTH_SECRET` (MUST match noclulabs' value exactly), `AUTH_URL` (`https://cal.noclulabs.com` in prod), `AUTH_TRUST_HOST=true` (required behind the Caddy reverse proxy).

## Calendar abstraction layer

External calendar integrations (Google, Microsoft, CalDAV, etc.) implement
the `CalendarProvider` interface defined at `src/lib/calendar/types.ts`.
Providers are stateless: tokens are passed as arguments to every method,
never held on a provider instance. This keeps providers easy to test and
prevents cross-request token leakage.

Concrete providers live at `src/lib/calendar/providers/<id>.ts` and are
registered via `registerProvider` in `src/lib/calendar/providers/index.ts`.
Phase 2b adds a side-effecting `register-all.ts` that imports and registers
each concrete provider; server entry points import `register-all` once at
startup before any code path that calls `getProvider`.

Webhook subscription methods are intentionally NOT part of the
`CalendarProvider` interface yet; when webhooks ship, they go on a separate
extension interface that webhook-capable providers implement in addition to
the base `CalendarProvider` (status and rationale in ROADMAP § Deferred
items).

### Storage shape

`calendar_connections` is the storage table for OAuth-connected calendars.
Schema lives at `src/lib/db/schema/calendar-connections.ts`. One row per
(user, provider) for the MVP, enforced by a unique index. Disconnect is a
hard DELETE; there is no soft-delete column. Access and refresh tokens are
stored as ciphertext (`v1:base64nonce:base64ciphertext`; the `v1:` prefix
versions the key so it rotates without a schema change), see § Token
encryption below.

### Token encryption (summary)

`src/lib/calendar/crypto.ts` does AES-256-GCM via `node:crypto` (no external
deps), with the `v1:base64nonce:base64ciphertext` format and a fresh 12-byte
nonce per encryption. The key comes from `process.env.TOKEN_ENCRYPTION_KEY`
(base64 32 bytes), loaded lazily so the build does not crash without it.
Decryption failures all throw: route code should treat the connection as
broken, delete the row, and prompt reconnect. Full rationale (version-prefix
key rotation, test key handling, no-logging guarantee) in
`CALENDAR-PLAYBOOK.md` § Token encryption.

### Google Calendar provider (summary)

`src/lib/calendar/providers/google.ts` exports `googleCalendarProvider` over
the `googleapis` SDK. Stateless (tokens are method arguments), credentials
loaded lazily, no import side effects. Four OAuth scopes (`openid`, `email`,
`calendar.events`, `calendar.readonly`); `exchangeCode` verifies the id_token
via `OAuth2.verifyIdToken` before trusting `sub` / `email`. `register-all.ts`
wires it via `registerProvider`. Full rationale (scope reasoning,
`access_type` / `prompt`, `email_verified` not enforced, refresh-token
preservation, revoke, Meet conferencing) in `CALENDAR-PLAYBOOK.md` § Google
Calendar provider.

### Calendar connection flow (operational rules)

The OAuth connect / callback / disconnect flow lives in
`src/app/api/calendar/google/{connect,callback}/route.ts` and
`src/app/settings/calendars/actions.ts`; the settings page renders
connect-or-disconnect from the session. The load-bearing rules:

- **Redirect URLs come from `getAppOrigin()` (`src/lib/app-url.ts`), never
  `request.url`.** Behind Caddy, `request.url` is the internal bind address
  (`http://0.0.0.0:3000`), not the public host. Any future route building a
  redirect back into the app uses this helper.
- **Redirect URI is environment-gated** (`https://cal.noclulabs.com/...` in
  prod, `http://localhost:3000/...` in dev) and the same value must go to both
  `buildAuthorizationUrl` and `exchangeCode`, or Google rejects the exchange.
- **CSRF via cookie-based `state`**: 32-byte value in a `__Host-noclucal-oauth-state`
  cookie (SameSite `lax`), compared with `crypto.timingSafeEqual`; mismatch
  redirects `?error=state_mismatch`.
- **`replaceConnection`** does DELETE-then-INSERT in `db.transaction` (clean
  reconnect under the unique-per-(user, provider) index).
- **Disconnect** is best-effort `provider.revoke` plus unconditional local
  delete.
- **`getValidTokensForConnection`** refreshes within a 60-second expiry margin;
  on refresh failure it deletes the row and throws `RefreshFailedError`
  (callers route to reconnect).
- **Auth gate exception**: the callback is NOT in the `proxy.ts` matcher (it
  would lose the single-use `code`); it self-checks and redirects
  `?error=session_lost`.

Full prose for each rule is in `CALENDAR-PLAYBOOK.md` § Calendar connection flow.

## Event types and availability

The booking-core table definitions live in § Database / Schema above; the deep
Phase 3a storage rationale lives in `CALENDAR-PLAYBOOK.md` § Event types and
availability storage. Two rules carry forward as active: do not retrofit a
`schedule_id` until multi-schedule is scoped, and new host preferences belong
on `host_settings`, never on the `noclucal_users` shadow table.

## Slot computation

`computeSlots` at `src/lib/scheduling/compute-slots.ts` (with `intervals.ts` and
`types.ts`) is the pure, deterministic slot engine. Every input is an argument
(`now`, range, host timezone, rules, overrides, event config, injected busy
intervals): no clock read, no DB, no network, so the DST matrix is testable
offline. Slots are timezone-agnostic UTC instants (invitee timezone is a UI
concern, not an input). Key rules, all detailed in `CALENDAR-PLAYBOOK.md` §
Slot computation:

- **Override composition is replace-with-block-wins**: any override row for a
  date replaces that date's weekly rules; any block row makes the whole date
  unavailable; otherwise windows are the union of available override rows.
- **Buffer overlap is half-open**: a slot's guarded interval
  `[start - bufferBefore, end + bufferAfter]` must overlap no busy interval;
  touching at a boundary is not an overlap.
- **Wall-clock stepping, nominal fit, real-time end**: candidates step in
  wall-clock minutes and must fit the window by nominal duration, but the end
  instant is real elapsed time (the two duration uses are distinct, and this is
  what keeps a DST-spanning meeting its nominal length).
- **DST via `wallClockToInstant`**: spring-forward nonexistent times are dropped
  (round-trip check fails), fall-back ambiguous times are offered once.
- **min-notice / max-future clamp the slot start**, not its end; an empty
  effective window yields `[]`.

`getAvailableSlots` at `src/lib/booking/available-slots.ts` (Phase 4b) is the
runtime entry to this engine: `busy = external ∪ internal` (Google freebusy ∪
the host's confirmed bookings). No connection degrades; an unreadable one
throws `CalendarUnavailableError`, a missing or disabled event type throws
`NotBookableError`, and the external fetch is behind an injectable resolver for
tests. Full rationale in `CALENDAR-PLAYBOOK.md` § Available-slots orchestration.

The public booking page at `src/app/[username]/[slug]/` (Phase 4c) is the first
invitee-facing consumer: it resolves the route (`src/lib/booking/resolve.ts`,
unknown / disabled 404s), renders these UTC slots in the invitee's timezone, and
never offers a slot it could not verify against the host calendar. The
`confirmBooking` action in that route's `actions.ts` (Phase 4d) writes the
booking: re-resolve, re-check, claim under the exclusion constraint, then create
the Google event best-effort. Full rationale in `CALENDAR-PLAYBOOK.md` § Booking
write flow.

## Event type management

The event types vertical slice (Zod `validation.ts`, user-scoped `queries.ts`,
the `/settings/event-types` routes, `EventTypeForm`, and the
create/update/delete actions) follows the patterns used by every later settings
feature. The carry-forward rules, detailed in `CALENDAR-PLAYBOOK.md` § Event
type management:

- **Authz is server-side and per-user.** Every `queries.ts` function takes a
  `userId` and filters on both `userId` and `id`; actions resolve `userId` from
  `auth()` and never trust a client-supplied id beyond re-scoping it.
- **Slugs** are lowercase kebab-case (`SLUG_PATTERN` + `RESERVED_SLUGS`), unique
  per-user via `event_types_user_slug_unique`; the writes map Postgres `23505`
  to a `SlugConflictError` (via `isUniqueViolation` walking the `cause` chain)
  surfaced as a field error, never a 500.
- **Server-side re-validation is the gate.** Actions re-parse `FormData` with
  the same schema via `safeParse`; client validation is convenience only.
- **Checkbox and swatch post through controlled hidden inputs** (literal
  `"true"`/`"false"`, palette token validated with `z.enum(EVENT_TYPE_COLORS)`),
  because a raw checkbox posts nothing when unchecked.

## Availability and timezone management

The availability vertical slice (`validation.ts`, `queries.ts`, the
`/settings/availability` page, the weekly editor, timezone picker, and overrides
editor, plus the save actions) spans Phase 3d (weekly schedule + timezone) and
3e (date overrides). Nothing here imports `computeSlots`; it only writes the
rows the engine reads. The carry-forward rules, detailed in
`CALENDAR-PLAYBOOK.md` § Availability and timezone management:

- **Transactional replace, not per-row diffing.** `replaceAvailabilityRulesForUser`
  (whole week) and `setDateOverrideForUser` (one date) each delete-then-insert
  in one `db.transaction`. Editing is just setting again. An empty weekly
  submission is valid and clears all rules.
- **Variable-length ranges travel as one JSON string** in a single form field
  (`schedule` / `override`), parsed and re-validated server-side; indexed form
  fields are deliberately not used.
- **`"HH:MM"` end to end**, seconds truncated on read (`slice(0, 5)`); the
  end-after-start refine compares the zero-padded strings lexicographically.
- **Timezone** is one IANA value in `host_settings` (upserted), re-validated
  server-side with Luxon `IANAZone.isValidZone`; the client `Intl` list is
  convenience only.
- **Date-keyed overrides are replace-with-block-wins** and mutually exclusive
  (a date is blocked with empty ranges, or available with >=1 range); the
  `dateOverrideInputSchema` shape guarantees the rows satisfy the 3a
  `availability_overrides` CHECK, and a `"YYYY-MM-DD"` regex + Luxon validity
  refine rejects impossible dates.
- **Independent saves, server-side authz.** Timezone, weekly schedule, and each
  override save independently; every action resolves `userId` from `auth()` and
  re-validates; client checks are friendlier feedback, never the gate.

## Settings shell

`src/app/settings/layout.tsx` wraps every `/settings` route in a sidebar plus a
centered content frame (collapses to a stacked top bar on narrow viewports). The
nav order is Overview, Event types, Availability, Calendars, Bookings.

- **Active route** is computed in the `"use client"` `settings-nav.tsx` via
  `usePathname`: Overview matches `/settings` exactly, every other item also
  matches its nested routes.
- **Overview (`/settings`)** reads existing queries only (connection, event type
  count, availability rules, timezone); it adds no data-access. Pages render
  bare section content into the frame, so they carry no full-page `<main>`.
- **Single-placeholder policy:** an unbuilt feature gets one honest placeholder
  behind a "soon" nav item (Bookings), never coming-soon stubs scattered around.
- **Sign-out** (`actions.ts`) is relying-party: `signOut` clears the Auth.js
  cookie scoped to `.noclulabs.com`, signing the user out suite-wide, then
  redirects to noclulabs sign-in.

## Email sending

Wired as of Phase 5c: after a successful booking, `confirmBooking` enqueues a `send-confirmation` job and the worker sends the branded confirmation through Resend. The enqueue is best-effort and appended after the claim and the Google write-back; a failure is logged and never affects the booking. The pattern:

- **Lazy Resend client** at `src/lib/email/client.ts`, mirroring the DB and queue modules: zero import side effects; `RESEND_API_KEY` and `EMAIL_FROM` throw on first use, never at import. Server-side by convention like the DB and crypto modules; `server-only` was removed in 5c so the tsx worker can import the send path (why: `INFRA-PLAYBOOK.md` § The worker).
- **Self-contained payload.** The job payload is exactly the `sendConfirmationEmail` input (`SendConfirmationJobPayload` in `src/lib/queue/constants.ts`); `confirmBooking` builds it from data it already holds and the worker passes `job.data` through with no DB read. Job options: `INFRA-PLAYBOOK.md` § Redis and BullMQ operations.
- **Templates** live in `src/emails/` as React Email components with inline styles and the Indigo Signal tokens duplicated from `globals.css` (email clients cannot read CSS custom properties). Times render in the invitee timezone via `formatInstantForEmail` (`src/lib/email/format.ts`, Luxon, fixed en-US locale).
- **`sendConfirmationEmail`** renders both an HTML and a plain-text body and sends through Resend, returning the result as-is. Resend reports API failures via `result.error`, not by throwing (the worker raises them so BullMQ retries); only transport failures reject. The Meet link is optional (absent when the Google write-back failed); the template renders gracefully without it.
- The branded email **complements Google's own calendar invite** (which already carries the Meet link); it does not replace it.
- **Tests** mock the `resend` SDK and inject a stubbed enqueue in the booking tests; no test needs a live Redis, a real key, or a network.
- **Env.** `RESEND_API_KEY` and `EMAIL_FROM` are required for sending in prod as of 5c; a missing value fails the send job (retried, then logged), never the worker boot or the booking.

## Known minor issues

- **Caddy access logging for `cal.noclulabs.com` is disabled** (Phase 1a ops; not blocking; re-enable steps in `INFRA-PLAYBOOK.md` § Caddy access log).
