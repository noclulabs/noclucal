# Changelog

All notable changes to noCluCal will be documented in this file. Format follows the conventional commits convention and groups changes under [Unreleased] / Added / Changed / Fixed / Removed.

## [Unreleased]

### Added

- feat(phase-1c): first Drizzle schema. `noclucal_users` shadow table (id uuid PK, username citext NOT NULL, display_name text nullable, observed_at timestamptz NOT NULL default now()). Custom `citext` Drizzle column type at `src/lib/db/schema/_types.ts`. Barrel export at `src/lib/db/schema/index.ts`.
- feat(phase-1c): first migration `drizzle/migrations/0000_even_the_twelve.sql`. Hand-edited to prepend `CREATE EXTENSION IF NOT EXISTS citext;` because Drizzle does not auto-generate extension creation. Applied to local dev DB via `pnpm db:migrate`; will apply to `noclucal_prod` automatically when deploy.yml runs the migrate Compose profile on merge.
- feat(phase-1c): `src/lib/db/index.ts` updated to pass `schema` to `drizzle()`, so `db.query.noclucalUsers` is now typed. Module also re-exports `schema` for callers that need raw table refs.
- feat(phase-1c): `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:migrate:deploy`, `pnpm db:studio`, and `pnpm db:test:setup` scripts.
- feat(phase-1c): migrator Docker stage in the multi-stage Dockerfile. Lightweight image carrying node_modules + drizzle-kit + drizzle/migrations + drizzle.config.ts + src/lib/db. Not shipped in the runtime web image.
- feat(phase-1c): migrate service in docker-compose.yml gated by the `migrate` profile so it stays out of the default `docker compose up` set.
- ci(phase-1c): deploy.yml now invokes `docker compose --profile migrate run --rm --build migrate` between `git pull` and the web rebuild. Migrations apply against `noclucal_prod` before the new container starts. Idempotent via Drizzle's __drizzle_migrations tracking table.
- ci(phase-1c): ci.yml gains a postgres:18-alpine service container with health checks, a `DATABASE_URL` job env pointing at the service, and a `pnpm db:test:setup` step before lint. Infrastructure for future DB-touching tests.
- feat(phase-1b): Drizzle ORM + `pg` driver wired with a lazy-init connection module at `src/lib/db/index.ts` exporting `pool`, `db`, and `closeDb`. Pool config: max 10 connections, 30s idle timeout, 5s connect timeout. Importing the module has no side effects; constructs the pool on first use and throws if `DATABASE_URL` is unset. Mirrors noclulabs' Phase 3a pattern exactly.
- feat(phase-1b): `docker-compose.dev.yml` for local Postgres 18 on host port 5434, database `noclucal_dev`, user `noclucal`. Volume mounted at `/var/lib/postgresql` to keep PG18+ data under its major-version subdirectory.
- feat(phase-1b): `drizzle.config.ts` pointing drizzle-kit at `./src/lib/db/schema/*.ts` (currently empty; first schema lands in 1c). Migration output configured at `./drizzle/migrations/`.
- feat(phase-1b): `scripts/db-smoke-test.ts` and `pnpm db:smoke` script. Runs `SELECT version()`, `SELECT 1`, and `SELECT NOW()` against the pool to validate connectivity. Permanent diagnostic infrastructure (matches noclulabs' convention).
- chore(phase-1b): added `drizzle-orm`, `pg` to dependencies; `drizzle-kit`, `@types/pg`, `tsx` to devDependencies. Versions pinned to noclulabs.
- docs(phase-1b): `.env.example` extended with `DATABASE_URL` for local dev, documented production format with `&uselibpqcompat=true` suffix.
- feat(phase-1a): Next.js 16 App Router scaffold with TypeScript strict, Tailwind v4, Space Grotesk via `next/font/google`, the Indigo Signal palette duplicated from the noclulabs design system in `globals.css`, placeholder homepage at `/`, and the project structure laid out under `src/`.
- feat(phase-1a): Vitest harness with jsdom environment, `@/` path alias, and one smoke test verifying the path alias resolves correctly.
- feat(phase-1a): multi-stage Dockerfile (deps / build / runner on `node:20-alpine`) producing a standalone Next.js server image, paired with `docker-compose.yml` mapping host port 3002 to container port 3000.
- ci(phase-1a): GitHub Actions `ci.yml` runs lint, type-check, test, and build on every push and PR to `main`. `deploy.yml` auto-deploys to the DigitalOcean droplet on every push to `main` via SSH (clone, pull, rebuild). No migrate step yet (Phase 1c).
- docs(phase-1a): `.env.example` with the Auth.js v5 RP-mode variables, `.gitignore` (already from Phase 0), `robots.txt` blocking all crawlers until the booking flow ships.
- docs(phase-0): seed `CLAUDE.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md` with the architectural decisions from the design session. Captures the SSO bridge to noclulabs.com (shared cookie on `.noclulabs.com` parent domain, shared `AUTH_SECRET`, JWT shape mirrored exactly, no auth providers in noCluCal), the separate-database-in-shared-cluster decision for the DigitalOcean Managed Postgres instance, the `CalendarProvider` interface abstraction with Google as the first provider, and the deployment shape (Docker on the shared DO droplet behind Caddy on host port 3002). No code in this PR.
- chore(phase-0): standard `.gitignore` for Node + Next.js, including `.env*` exclusions.

### Fixed

- ops(phase-1a-followup): Caddy access log block for cal.noclulabs.com removed from `/etc/caddy/Caddyfile` on the droplet because `/var/log/caddy/` is not writable by the Caddy user. Logged in ROADMAP as a deferred polish item; re-enable later by pre-creating the log file with the correct ownership.
- chore(phase-1a): rename `gitignore` (committed without the leading dot in Phase 0) to `.gitignore` so git actually honors the ignore rules.
