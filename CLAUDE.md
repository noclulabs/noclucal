# CLAUDE.md

> Project context file for Claude Code sessions. Read this file first, every session.

## Project Overview

**noCluCal** is a booking platform in the noClu suite. It lets visitors book time with noCluCal users through public booking pages, integrates with external calendars (Google first; Microsoft, CalDAV, and a first-party noClu calendar planned), and is the second product in the noClu suite after noclulabs.com. Identity is federated from noclulabs.com via a shared-cookie SSO bridge; noCluCal trusts inbound JWTs signed with the same `AUTH_SECRET` and never writes to noclulabs' users table.

- **Domain:** cal.noclulabs.com (subdomain of noclulabs.com for cookie-based SSO)
- **Repository:** github.com/noclulabs/noclucal
- **Hosting:** DigitalOcean Droplet (shared with noclulabs.com and portalNetwork; unique host port)
- **Status:** Phase 4 underway (4a complete). Shipped so far: Phase 1 (SSO bridge, `/me`, `noclucal_users` lazy upsert), Phase 2 (Google Calendar provider, connect / disconnect, `/settings/calendars`, AES-256-GCM token encryption), Phase 3a (booking-core storage: `event_types`, `host_settings`, `availability_rules`, `availability_overrides`, the `EVENT_TYPE_COLORS` palette, migration 0002), 3b (the pure `computeSlots` engine, tested but not yet wired to a consumer), 3c (event types management at `/settings/event-types`), 3d (weekly availability and IANA timezone at `/settings/availability`), 3e (date overrides as a third section on that page), 3f (the settings app shell: sidebar navigation, the `/settings` overview home, sign-out, and a Bookings placeholder), and 4a (the booking data layer: the `bookings` table, the `bookings_no_overlap_per_host` exclusion constraint, and host-scoped data-access, tested but not yet wired to a runtime path). Phase 3 required scope is closed (only the optional live slot preview remains); Phase 4 continues with 4b through 4e. Per-phase detail lives in ROADMAP.md and CHANGELOG.md; booking-core design rationale lives in `CALENDAR-PLAYBOOK.md`.

## Bible files (canonical set)

Four files are the continuity mechanism across architect sessions. Every architect prompt reads them at ramp-up; every PR updates the ones it affects. The set is intentionally small. More files mean faster drift.

| File | When updated | Owns |
|------|-------------|------|
| CLAUDE.md | Per-PR when a change has architectural significance, when a new pattern is established, or when a deferred item surfaces | Project context, stack, conventions, current state, design rationale, file structure, gotchas, lessons learned |
| CHANGELOG.md | Every PR, no exceptions | Change log entries in conventional commit format under [Unreleased] / Added / Changed / Fixed / Removed |
| ROADMAP.md | Per-PR when phase status changes, when a future arc gets fleshed out, or when a deferred item is logged or resolved | Version targets, planned work, completed phase history, future arcs, deferred items, known minor issues |
| README.md | When user-facing features change, when setup changes, when the public feature list needs updating | Public-facing setup, project structure, feature list, deployment notes |

### Reference layer (not bible files)

`CALENDAR-PLAYBOOK.md` is a read-on-demand reference, not a bible file. It holds
the deep per-feature design rationale (calendar internals, slot computation,
event types, availability) that does not need to be in the always-loaded
CLAUDE.md. The rule that keeps CLAUDE.md bounded as the project grows:

- **CLAUDE.md keeps current state, active conventions, and gotchas that will
  bite the next session.** When a phase ships, its deep rationale is summarized
  to a few lines here plus a pointer into the playbook.
- **The playbook absorbs the rationale.** It is append-mostly and read on
  demand, so its growth costs nothing per session and does not create sync
  drift (nobody re-edits last quarter's rationale).
- **Split reference files by durable domain, not by phase.** One playbook now
  (`CALENDAR-PLAYBOOK.md`); add another (e.g. `AUTH-PLAYBOOK.md`) only when a
  domain's rationale actually outgrows a lean summary. One-file-per-phase is the
  path that causes drift, so do not take it.

The bible set stays the four files above. Adding the playbook does not grow it.

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
        0001_snapshot.json
        0002_snapshot.json
        0003_snapshot.json
      0000_even_the_twelve.sql
      0001_equal_guardsmen.sql
      0002_boring_nighthawk.sql
      0003_hard_alex_power.sql
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
        calendar/
          google/
            callback/
              route.ts
            connect/
              route.ts
      me/
        page.tsx
      settings/
        availability/
          actions.ts
          availability-editor.tsx
          overrides-editor.tsx
          page.tsx
          timezone-picker.tsx
        bookings/
          page.tsx
        calendars/
          actions.ts
          page.tsx
        event-types/
          [id]/
            page.tsx
          new/
            page.tsx
          actions.ts
          event-type-form.tsx
          page.tsx
        actions.ts
        layout.tsx
        page.tsx
        settings-nav.tsx
      globals.css
      layout.tsx
      page.tsx
    lib/
      availability/
        queries.ts
        validation.ts
      auth/
        upsert-noclucal-user.ts
      bookings/
        constants.ts
        queries.ts
      calendar/
        providers/
          google.ts
          index.ts
          register-all.ts
        connections.ts
        crypto.ts
        oauth-state.ts
        types.ts
      db/
        schema/
          _types.ts
          availability.ts
          bookings.ts
          calendar-connections.ts
          event-types.ts
          host-settings.ts
          index.ts
          users.ts
        index.ts
      event-types/
        colors.ts
        queries.ts
        validation.ts
      scheduling/
        compute-slots.ts
        intervals.ts
        types.ts
      app-url.ts
      version.ts
    auth.config.ts
    auth.ts
    proxy.ts
  tests/
    lib/
      availability/
        queries.test.ts
        validation.test.ts
      auth/
        upsert-noclucal-user.test.ts
      bookings/
        queries.test.ts
      calendar/
        providers/
          google.test.ts
          register-all.test.ts
          registry.test.ts
        connections.test.ts
        crypto.test.ts
        oauth-state.test.ts
      db/
        schema/
          availability.test.ts
          calendar-connections.test.ts
          event-types.test.ts
          host-settings.test.ts
      event-types/
        colors.test.ts
        queries.test.ts
        validation.test.ts
      scheduling/
        compute-slots.test.ts
        intervals.test.ts
      app-url.test.ts
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

The tree reflects current reality through Phase 4a. The per-phase record of which files each phase added (and which dependencies it introduced: `luxon` in 3b, `zod` in 3c) lives in CHANGELOG.md and ROADMAP.md, not here.

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
- **Hand-managed EXCLUDE constraint.** The `bookings_no_overlap_per_host` exclusion constraint (and its `btree_gist` extension) is hand-added in migration 0003; Drizzle does not model `EXCLUDE`, so `pnpm db:generate` neither creates nor sees it (confirmed: it emits no drop). Never let a future migration drop it; re-add it by hand if the table is ever regenerated.

### Dependencies

- **Pinning.** Shared dependencies (for example `zod`, `next-auth`, `drizzle-orm`) match noclulabs' pin style for cross-suite consistency; noClu-specific dependencies (for example `luxon`, `googleapis`) pin exact. Either way the lockfile (`pnpm-lock.yaml`) is authoritative for reproducible installs.

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

Design rationale for the booking-core tables (`event_types`, `host_settings`, `availability_rules`, `availability_overrides`) lives in CALENDAR-PLAYBOOK.md § Event types and availability storage.

- **`noclucal_users`** (Phase 1c). Shadow table projecting the authoritative users table that lives in the noclulabs DB. Pure-projection invariant: no FK to anything, noclulabs is the source of truth, and noCluCal never writes back. `id` has no default and is set from the noclulabs JWT (noCluCal does not generate user ids). `username` is `citext` (needs the citext extension, created in migration 0000). Rows are inserted lazily on first observation of each user via `src/lib/auth/upsert-noclucal-user.ts` (Phase 1d), which refreshes the cached `username` / `display_name` via `ON CONFLICT (id) DO UPDATE`. Full columns in `src/lib/db/schema/users.ts`.

- **`calendar_connections`** (Phase 2a). One row per OAuth-connected external calendar account; `user_id` FK to `noclucal_users.id` (cascade delete). Access and refresh tokens are encrypted at rest (ciphertext columns in `v1:base64nonce:base64ciphertext` format). Unique index on `(user_id, provider)` enforces one account per provider for the MVP. Full columns in `src/lib/db/schema/calendar-connections.ts`; full design in the calendar abstraction layer section.

- **`event_types`** (Phase 3a). Per-user bookable event type definitions; `user_id` FK to `noclucal_users.id` (cascade delete). Unique index `event_types_user_slug_unique` on `(user_id, slug)` makes the slug unique per host; a lookup index covers `(user_id)`. Full columns in `src/lib/db/schema/event-types.ts`.

- **`host_settings`** (Phase 3a). noCluCal-owned per-user scheduling config (currently the booking `timezone`), keyed 1:1 on `user_id` PK and FK to `noclucal_users.id` (cascade delete). It exists to hold host-owned config off the `noclucal_users` shadow table, keeping that table a pure projection. Full columns in `src/lib/db/schema/host-settings.ts`.

- **`availability_rules`** (Phase 3a). Recurring weekly availability windows, keyed on `user_id` directly (one schedule per host; no FK to `event_types`, no `schedule_id`). `user_id` FK cascade. Lookup indexes on `(user_id)` and `(user_id, weekday)`. Multiple rows per `(user_id, weekday)` are intentionally allowed (no unique constraint on the pair) so split days are first-class. CHECK constraints `availability_rules_weekday_range` (weekday between 1 and 7) and `availability_rules_time_order` (start < end). Full columns in `src/lib/db/schema/availability.ts`.

- **`availability_overrides`** (Phase 3a). Date-specific exceptions to the recurring schedule; `user_id` FK cascade. Lookup indexes on `(user_id)` and `(user_id, date)`. Multiple rows per `(user_id, date)` are intentionally allowed (no unique constraint on the pair) so split custom days are first-class. CHECK constraint `availability_overrides_shape` keeps the two modes mutually exclusive and well-formed: either a blocked day (`is_available = false` with null times) or a custom-hours day (`is_available = true` with non-null times and start < end). Full columns in `src/lib/db/schema/availability.ts`.

- **`bookings`** (Phase 4a). Immutable historical record of confirmed bookings. `event_type_id` FK to `event_types.id` is `ON DELETE SET NULL` (nullable) so history survives event-type deletion; `host_user_id` FK to `noclucal_users.id` (cascade). Snapshots `event_type_name` and `duration_minutes` at booking time so a row is self-describing (read the snapshot, do not join back through the FK). `status` is an app-level varchar(20) default `confirmed`, not a pg enum. Lookup indexes on `(host_user_id)`, `(host_user_id, starts_at)`, and `(event_type_id)`. The `bookings_no_overlap_per_host` exclusion constraint (`EXCLUDE USING gist (host_user_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE status = 'confirmed'`, needing `btree_gist`) makes two overlapping confirmed bookings for one host physically impossible; half-open `tstzrange` (so abutting bookings do not conflict); hand-added in migration 0003 (Drizzle does not model it, see § Conventions). Full columns in `src/lib/db/schema/bookings.ts`. Rationale in CALENDAR-PLAYBOOK.md § Booking model.

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

The booking-core table definitions live in § Database / Schema above. The deep
storage rationale from Phase 3a (storage-only scope, the per-user single
schedule with no `schedule_id`, the normalized multiple-rows-per-key model, ISO
weekday + wall-clock time, integer minutes over `interval`, color as an
app-validated token, and `host_settings` preserving the shadow-table invariant)
lives in `CALENDAR-PLAYBOOK.md` § Event types and availability storage. Two of
those carry forward as active rules: do not retrofit a `schedule_id` until
multi-schedule is scoped, and new host preferences belong on `host_settings`,
never on the `noclucal_users` shadow table.

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

## Known minor issues

- **Caddy access log block removed during Phase 1a ops.** The `log {}` block for `cal.noclulabs.com` was stripped from `/etc/caddy/Caddyfile` because `/var/log/caddy/` is not writable by the Caddy user on the droplet. Re-enable by pre-creating the log file with `caddy:caddy` ownership before adding the `log {}` block back. Not blocking; access logs are nice-to-have.
