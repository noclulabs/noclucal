# CLAUDE.md

> Project context file for Claude Code sessions. Read this file first, every session.

## Project Overview

**noCluCal** is a booking platform in the noClu suite. It lets visitors book time with noCluCal users through public booking pages, integrates with external calendars (Google first; Microsoft, CalDAV, and a first-party noClu calendar planned), and is the second product in the noClu suite after noclulabs.com. Identity is federated from noclulabs.com via a shared-cookie SSO bridge; noCluCal trusts inbound JWTs signed with the same `AUTH_SECRET` and never writes to noclulabs' users table.

- **Domain:** cal.noclulabs.com (subdomain of noclulabs.com for cookie-based SSO)
- **Repository:** github.com/noclulabs/noclucal
- **Hosting:** DigitalOcean Droplet (shared with noclulabs.com and portalNetwork; unique host port)
- **Status:** Phase 3a complete. Phases 1 (SSO bridge, `/me` proof-of-life, `noclucal_users` lazy upsert) and 2 (Google Calendar provider, connect / disconnect, `/settings/calendars`, AES-256-GCM token encryption) are closed. Phase 3a ships the storage shape for the booking core: `event_types`, `host_settings`, `availability_rules`, and `availability_overrides` tables plus the shared `EVENT_TYPE_COLORS` palette and migration 0002. Storage only; slot-computation logic is Phase 3b and the settings UI is Phase 3c.

## Bible files (canonical set)

Four files are the continuity mechanism across architect sessions. Every architect prompt reads them at ramp-up; every PR updates the ones it affects. The set is intentionally small. More files mean faster drift.

| File | When updated | Owns |
|------|-------------|------|
| CLAUDE.md | Per-PR when a change has architectural significance, when a new pattern is established, or when a deferred item surfaces | Project context, stack, conventions, current state, design rationale, file structure, gotchas, lessons learned |
| CHANGELOG.md | Every PR, no exceptions | Change log entries in conventional commit format under [Unreleased] / Added / Changed / Fixed / Removed |
| ROADMAP.md | Per-PR when phase status changes, when a future arc gets fleshed out, or when a deferred item is logged or resolved | Version targets, planned work, completed phase history, future arcs, deferred items, known minor issues |
| README.md | When user-facing features change, when setup changes, when the public feature list needs updating | Public-facing setup, project structure, feature list, deployment notes |

A fifth playbook file (e.g. `CALENDAR-PLAYBOOK.md`) may be added later if a content-style or workflow-style reference emerges, analogous to noclulabs' `ANIMATION-PLAYBOOK.md`. Not present at Phase 0.

### Ramp-up rule for every Claude Code prompt

Every architect-generated executor prompt MUST include all four files in its ramp-up file list. If a prompt omits any of the four, it is a defect; the architect notes it and corrects.

### Per-PR update rule

Every PR's done-definition includes a "Bible file updates (REQUIRED)" section. That section lists the bibles being modified by the PR with the specific edits called out. PRs that legitimately touch no bibles (extremely rare; pure refactoring with no observable behavior change) explicitly note "no bible changes" with the reason.

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Font:** Space Grotesk (inherited from noclulabs design system, via `next/font/google`)
- **Database:** PostgreSQL 18 via Drizzle ORM with the `pg` driver
- **Caching and queues:** Redis with BullMQ for slot holds, rate limiting, and background jobs (confirmation email, reminders, OAuth token refresh, webhook processing)
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
- **Deployment:** Docker on a DigitalOcean Droplet behind a Caddy reverse proxy (Caddy terminates TLS for `cal.noclulabs.com` and proxies to the `web` container)

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
- **Session revocation deferred.** noclulabs.com revokes sessions on password change via the `signedInAt < password_changed_at` check in its DB-capable session callback. noCluCal does NOT replicate that check at Phase 1, because doing so would require either a DB lookup against noclulabs (architectural violation) or an HTTP round-trip per page render (latency tax). Trade-off: a revoked noclulabs session remains valid in noCluCal until the JWT naturally expires (Auth.js default 30 days). Logged as a deferred item in ROADMAP. Options for closing the gap when there are real users: (a) noclulabs exposes a `/api/auth/validate-session` endpoint that noCluCal pings on session resolution, with caching to amortize cost; (b) promote noclulabs.com to a proper OIDC provider with token introspection.

## File Structure

```
noclucal/
  .github/
    workflows/
      ci.yml
      deploy.yml
  drizzle/
    migrations/
      meta/
        _journal.json
        0000_snapshot.json
      0000_even_the_twelve.sql
      0001_equal_guardsmen.sql
      0002_boring_nighthawk.sql
  public/
    robots.txt
  scripts/
    db-smoke-test.ts
    db-test-setup.ts
  src/
    app/
      api/
        auth/
          [...nextauth]/
            route.ts
      me/
        page.tsx
      globals.css
      layout.tsx
      page.tsx
    lib/
      auth/
        upsert-noclucal-user.ts
      db/
        schema/
          _types.ts
          availability.ts
          calendar-connections.ts
          event-types.ts
          host-settings.ts
          index.ts
          users.ts
        index.ts
      event-types/
        colors.ts
      version.ts
    auth.config.ts
    auth.ts
    proxy.ts
  tests/
    lib/
      auth/
        upsert-noclucal-user.test.ts
      db/
        schema/
          availability.test.ts
          calendar-connections.test.ts
          event-types.test.ts
          host-settings.test.ts
      event-types/
        colors.test.ts
    setup.ts
    smoke.test.ts
  .dockerignore
  .env.example
  .gitignore
  CHANGELOG.md
  CLAUDE.md
  docker-compose.dev.yml
  docker-compose.yml
  Dockerfile
  drizzle.config.ts
  eslint.config.mjs
  next.config.ts
  package.json
  pnpm-lock.yaml
  postcss.config.mjs
  README.md
  ROADMAP.md
  tsconfig.json
  vitest.config.ts
```

Phase 1d added the Auth.js v5 RP-mode config split (`src/auth.config.ts`, `src/auth.ts`, `src/proxy.ts`), the NextAuth handlers route (`src/app/api/auth/[...nextauth]/route.ts`), the `noclucal_users` lazy upsert helper (`src/lib/auth/upsert-noclucal-user.ts`), and the `/me` proof-of-life page (`src/app/me/page.tsx`).

Phase 3a added the booking-core storage shape: the shared color palette (`src/lib/event-types/colors.ts`), three schema files (`src/lib/db/schema/event-types.ts`, `src/lib/db/schema/host-settings.ts`, `src/lib/db/schema/availability.ts`), the additive migration `drizzle/migrations/0002_boring_nighthawk.sql`, and integration tests under `tests/lib/db/schema/` plus the palette unit test at `tests/lib/event-types/colors.test.ts`. The tree above omits the Phase 2 calendar provider and settings files; that is pre-existing documentation drift, not introduced here.

## Deployment

- Live at https://cal.noclulabs.com with the placeholder homepage.
- Host port 3002 confirmed in use (portalNetwork = 3000, noclulabs = 3001, noCluCal = 3002).
- Caddy block for `cal.noclulabs.com` is live on the droplet, terminating TLS and proxying to `127.0.0.1:3002`.
- First manual deploy ops (clone to `/opt/noclucal`, create `.env`, add Caddy block) happened on 2026-05-26 alongside this PR.
- As of Phase 1c, `deploy.yml` runs `git pull` → `docker compose --profile migrate run --rm --build migrate` → `docker compose up -d --build` → `docker image prune -f`. Migrations apply against `noclucal_prod` before the new web container starts.

### Dockerfile stage ordering

The Dockerfile defines four stages in this order: `deps` → `build` → `migrator` → `runner`. The order is load-bearing: `docker-compose.yml`'s `web` service does NOT specify a `target:` directive, so Docker builds the LAST stage by default. `runner` must remain last for `web` to build the Next.js runtime image. The `migrate` Compose service uses `target: migrator` explicitly, so it is unaffected by where `migrator` sits in the file as long as it exists.

Phase 1c shipped with `migrator` as the last stage and production restart-looped on the migrator's CMD until this was caught and fixed.

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

Database wiring landed in Phase 1b; first schema and first migration landed in Phase 1c.

- **Cluster.** Same DigitalOcean Managed Postgres cluster as noclulabs (`noclulabs-postgres-prod`, Basic tier, PostgreSQL 18, SFO2, in the noCluHub VPC). Adding a database to the existing cluster is a no-op for billing and operationally simpler than a second cluster.
- **Databases.** `noclucal_dev` (local Mac via `docker-compose.dev.yml`, host port 5434 to avoid clashing with noclulabs' 5433), `noclucal_test` (CI service container, ephemeral), `noclucal_prod` (DO managed cluster, provisioned 2026-05-26). Separate databases (not schemas) for engine-enforced isolation.
- **Connection module.** `src/lib/db/index.ts` exports `pool`, `db`, `closeDb()`, and re-exports `schema`. Lazy initialization via a Proxy: importing the module has zero side effects; the `Pool` and Drizzle client are constructed on first property access. An error is thrown at that point if `DATABASE_URL` is unset. This is load-bearing because Next.js's build-time page-data collection loads route modules that transitively import the DB without `DATABASE_URL` being set; eager init at import time would crash the build. Pool config: max 10 connections, 30s idle timeout, 5s connection timeout. Mirrors noclulabs' Phase 3a pattern exactly.
- **Drizzle instance with schema.** As of Phase 1c, `db = drizzle(getPool(), { schema })`, so `db.query.noclucalUsers` is typed. New tables added to `src/lib/db/schema/` show up automatically once their file is exported from `schema/index.ts`.
- **Smoke test.** `pnpm db:smoke` runs `scripts/db-smoke-test.ts`, which fires `SELECT version()`, `SELECT 1`, and `SELECT NOW()` against the pool. Permanent diagnostic infrastructure; answers "is the database reachable right now?" without depending on any schema. Mirrors noclulabs' equivalent.
- **SSL workaround (critical).** Every `DATABASE_URL` used by node-pg / drizzle-orm / drizzle-kit MUST end with `&uselibpqcompat=true`. Same reason as noclulabs: DO's self-signed cert plus node-pg's `pg-connection-string` library treating `sslmode=require` as `verify-full`. `psql` does NOT need the suffix (libpq honors `sslmode=require` correctly out of the box). Local dev does not need the suffix either (no SSL on the local Postgres). The SSL workaround is identical to noclulabs' implementation; the droplet ops command pattern for stripping the suffix when shelling into psql lives in noclulabs' CLAUDE.md § Database / Production and applies here verbatim.
- **Two-URL pattern.** Public URL (Mac ops, Trusted Sources lists the developer's Mac IP) and VPC URL (droplet runtime, never leaves the VPC), both stored in Bitwarden under the noClu Infrastructure folder.
- **UUID PKs.** Postgres 18 native `uuidv7()` (time-ordered, no extension required). Not used yet by `noclucal_users` because the id comes from the noclulabs JWT, not from the DB.

### Schema

- **`noclucal_users`** (Phase 1c). Shadow table projecting the authoritative users table that lives in the noclulabs DB. Columns:
  - `id` (uuid, primary key, no default; set from the noclulabs JWT)
  - `username` (citext, not null; cached for case-insensitive joins)
  - `display_name` (text, nullable; cached for UI)
  - `observed_at` (timestamptz, not null, default `now()`; first observation timestamp)

  No FK to anything; noclulabs is the source of truth and noCluCal never writes back. Rows are inserted lazily on first observation of each user via `src/lib/auth/upsert-noclucal-user.ts` (shipped in Phase 1d). When `username` or `display_name` change on the noclulabs side, the lazy upsert refreshes them via `ON CONFLICT (id) DO UPDATE`.

- **`calendar_connections`** (Phase 2a). One row per OAuth-connected external calendar account. `user_id` FK to `noclucal_users.id` (cascade delete), `provider` discriminator, encrypted token ciphertext columns (`v1:base64nonce:base64ciphertext` format), `scopes text[]`, plus `connected_at` / `last_synced_at`. Unique index on `(user_id, provider)` enforces one account per provider for the MVP. See the calendar abstraction layer section for the full design.

- **`event_types`** (Phase 3a). Per-user bookable event type definitions. `id` uuid PK (Postgres 18 native `uuidv7()`), `user_id` FK to `noclucal_users.id` (cascade delete), `name` / `slug` varchar(200), `description` text nullable, and all durations as integer minutes: `duration_minutes`, `buffer_before_minutes` / `buffer_after_minutes` (default 0), `min_notice_minutes` (default 0), `max_future_minutes` (default 86400, 60 days), `slot_granularity_minutes` (default 15). `color` is a varchar(32) named palette token (default `indigo`); `enabled` boolean (default true); `created_at` / `updated_at` timestamptz. Unique index `event_types_user_slug_unique` on `(user_id, slug)` makes the slug unique per host; a lookup index covers `(user_id)`. Integer minutes (not Postgres `interval`) keep slot math in one unit. Slug lowercasing, kebab-case enforcement, and reserved-word checks are app-layer concerns for Phase 3c. Color validity is enforced at the app layer against `EVENT_TYPE_COLORS`, not by a DB CHECK or pg enum, so the palette evolves without a migration.

- **`host_settings`** (Phase 3a). noCluCal-owned per-user scheduling config. `user_id` uuid PK and FK to `noclucal_users.id` (cascade delete), `timezone` text (IANA, default `America/Los_Angeles`), `created_at` / `updated_at` timestamptz. This table exists so `noclucal_users` stays a pure projection of noclulabs identity: host-owned config like the booking timezone never lives on the shadow table. The PK on `user_id` is the only access path for the MVP. Timezone validation against Luxon's `IANAZone.isValidZone` is an app-layer concern for Phase 3c; 3a only sets a pragmatic column default.

- **`availability_rules`** (Phase 3a). Recurring weekly availability windows, keyed on `user_id` directly (the MVP runs one schedule per host, shared by every event type, so there is no FK to `event_types` and no `schedule_id`). `id` uuid PK (`uuidv7()`), `user_id` FK cascade, `weekday` smallint (ISO 1 to 7, Monday=1, Sunday=7, to match Luxon's `DateTime.weekday`), `start_time` / `end_time` as Postgres `time` (wall-clock, no timezone), `created_at` / `updated_at`. Lookup indexes on `(user_id)` and `(user_id, weekday)`. Multiple rows per `(user_id, weekday)` are intentional so split days (for example 09:00 to 12:00 and 13:00 to 17:00) are first-class; there is deliberately no unique constraint on the pair. CHECK constraints `availability_rules_weekday_range` (weekday between 1 and 7) and `availability_rules_time_order` (start < end).

- **`availability_overrides`** (Phase 3a). Date-specific exceptions to the recurring schedule. `id` uuid PK (`uuidv7()`), `user_id` FK cascade, `date` date, `is_available` boolean, `start_time` / `end_time` Postgres `time` (both nullable), `created_at` / `updated_at`. Lookup indexes on `(user_id)` and `(user_id, date)`. Multiple rows per `(user_id, date)` are allowed for split custom days, so there is no unique constraint on the pair. CHECK constraint `availability_overrides_shape` keeps the two modes mutually exclusive and well-formed: either a blocked day (`is_available = false` with null times) or a custom-hours day (`is_available = true` with non-null times and start < end). Times are interpreted in the host timezone from `host_settings`; UTC conversion is a Phase 3b slot-computation concern, never storage.

### Migrations

- **Workflow.** Edit a schema file, then `pnpm db:generate` produces SQL in `drizzle/migrations/`. Inspect the file. If a new Postgres extension is required (citext, pgcrypto, etc.), hand-edit the SQL to prepend `CREATE EXTENSION IF NOT EXISTS <name>;\n--> statement-breakpoint` before the first statement that depends on it (Drizzle does NOT auto-generate extension creation). Then `pnpm db:migrate` applies against local dev.
- **Statement breakpoints.** `--> statement-breakpoint` is Drizzle's convention for splitting one migration file into multiple SQL statements at runtime. Without it the file is one statement, and an extension-then-extension-column-type combo fails to apply.
- **Deploy.** On every merge to `main`, `deploy.yml` runs `docker compose --profile migrate run --rm --build migrate` before rebuilding the web container. Drizzle's `__drizzle_migrations` tracking table makes this idempotent: already-applied migrations are skipped. The order (migrate, then rebuild) suits additive migrations. For a migration that drops a column or otherwise breaks the previous app code, flip the order for that deploy (build first, migrate second).
- **CI.** `ci.yml` spins up a `postgres:18-alpine` service container, sets `DATABASE_URL` at the job level, and runs `pnpm db:test:setup` (which shells out to `pnpm db:migrate:deploy`) before lint. No tests use the DB yet; infrastructure lives now so Phase 1d slots in cleanly.

## Auth

Auth.js v5 is wired in SSO relying-party mode as of Phase 1d. All authentication happens at noclulabs.com; noCluCal verifies the JWT noclulabs signed and propagates the session via `auth()`. There is no signin/signup form here.

- **Config split.** Same edge-safe / server-only split as noclulabs: `src/auth.config.ts` (edge-safe, no `pg` / `drizzle` / `bcrypt` imports), `src/auth.ts` (extends, no providers since this is RP-only), `src/proxy.ts` (imports ONLY from `auth.config.ts`, replaces the Next.js 16 deprecated `middleware` convention). NEVER collapse to one file; the proxy compiles to the edge runtime and crashes if Node-only imports leak in.
- **No providers.** The Auth.js providers array is empty. Sign-in happens at noclulabs.com.
- **Cookie domain.** `cookies.sessionToken.options.domain = ".noclulabs.com"` in production (gated on `AUTH_URL` starting with `https://`). In dev the cookie stays host-only because browsers refuse parent-domain cookies on bare-host origins.
- **Cookie name prefix.** `__Secure-` prefix is applied in lockstep with `useSecureCookies`, matching noclulabs exactly so the same cookie is read on both sides.
- **JWT shape.** Mirrors noclulabs' augmentation: `{ id, username, role: "user" | "admin", signedInAt?: number, deviceId?: string }`. `signedInAt` and `deviceId` are read but never written here.
- **Session callback.** A pure pass-through that maps JWT fields onto `session.user`. No DB access, no mutation of the token.
- **Protected routes.** Listed in `src/proxy.ts`'s `config.matcher`. Phase 1d ships `/me` only; later phases extend the matcher. Unauthenticated visitors are redirected to `https://noclulabs.com/signin?redirect=<encoded original URL>`.
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
`CalendarProvider` interface yet. Watch channel renewal needs BullMQ for
recurring jobs, which lands with Redis in Phase 4. When webhooks ship, they
go on a separate extension interface that webhook-capable providers
implement in addition to the base `CalendarProvider`.

### Storage shape

`calendar_connections` is the storage table for OAuth-connected calendars.
Schema lives at `src/lib/db/schema/calendar-connections.ts`. One row per
(user, provider) for the MVP, enforced by a unique index. Disconnect is a
hard DELETE; there is no soft-delete column.

Access and refresh tokens are stored as ciphertext strings in the format
`v1:base64nonce:base64ciphertext`. The `v1:` prefix is a version marker so
we can rotate the encryption key without a schema change (a future `v2:`
prefix will indicate ciphertext produced by the next key). Encryption
helpers ship in Phase 2b; Phase 2a's schema accepts the columns as plain
text with no crypto applied.

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

## Event types and availability

Phase 3a ships the storage shape for the booking core. No business logic,
no UI, no input validation: those are Phase 3b (slot computation) and 3c
(settings UI). The reasoning below is recorded so 3b and 3c inherit it.

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

## Known minor issues

- **Caddy access log block removed during Phase 1a ops.** The `log {}` block for `cal.noclulabs.com` was stripped from `/etc/caddy/Caddyfile` because `/var/log/caddy/` is not writable by the Caddy user on the droplet. Re-enable by pre-creating the log file with `caddy:caddy` ownership before adding the `log {}` block back. Not blocking; access logs are nice-to-have.
