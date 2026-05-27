# CLAUDE.md

> Project context file for Claude Code sessions. Read this file first, every session.

## Project Overview

**noCluCal** is a booking platform in the noClu suite. It lets visitors book time with noCluCal users through public booking pages, integrates with external calendars (Google first; Microsoft, CalDAV, and a first-party noClu calendar planned), and is the second product in the noClu suite after noclulabs.com. Identity is federated from noclulabs.com via a shared-cookie SSO bridge; noCluCal trusts inbound JWTs signed with the same `AUTH_SECRET` and never writes to noclulabs' users table.

- **Domain:** cal.noclulabs.com (subdomain of noclulabs.com for cookie-based SSO)
- **Repository:** github.com/noclulabs/noclucal
- **Hosting:** DigitalOcean Droplet (shared with noclulabs.com and portalNetwork; unique host port)
- **Status:** Phase 1a complete. Next.js 16 scaffold deployed, CI/CD chain validated end-to-end.

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

Tokens are duplicated into noCluCal's `globals.css` (planned for Phase 1) rather than imported from noclulabs, to avoid runtime coupling. When tokens change in the brand style guide, both repos update in lockstep.

## Identity bridge (SSO with noclulabs.com)

noCluCal is a relying party to noclulabs.com's identity. Mechanics:

- **Cookie domain.** Auth.js writes its session cookie with `Domain=.noclulabs.com` (parent domain), so the cookie is visible to every subdomain in the noClu suite. noclulabs.com sets the cookie at sign-in; noCluCal reads it.
- **Shared AUTH_SECRET.** Both apps share the same `AUTH_SECRET` (managed in Bitwarden under the noClu Infrastructure folder). This lets noCluCal verify the JWT signature locally without an HTTP round-trip to noclulabs.
- **JWT shape.** Mirrors noclulabs exactly: `{ id, username, role: "user" | "admin", signedInAt: number }`. noCluCal augments `Session["user"]` and `JWT` with the same module declarations in its own `auth.config.ts`. If the shape changes in noclulabs, noCluCal must follow in lockstep.
- **No providers in noCluCal.** noCluCal does NOT run Credentials, OAuth, or any sign-in flow of its own. The Auth.js providers array is empty. All authentication happens at noclulabs.com/signin.
- **Sign-in redirect.** When an unauthenticated visitor hits a protected page on cal.noclulabs.com, the proxy redirects to `https://noclulabs.com/signin?redirect=https://cal.noclulabs.com/<original-path>` (URL-encoded). noclulabs.com's existing same-origin redirect sanitizer must be extended to allow `cal.noclulabs.com` as a trusted target, OR the redirect logic is generalized to a noClu-suite-aware sanitizer. Decision deferred to Phase 1 implementation.
- **No DB writes to noclulabs.** noCluCal NEVER writes to noclulabs' users table. References to users are by external user ID only, stored in noCluCal's own `noclucal_users` shadow table (a lightweight projection: user_id PK plus cached `username` / `display_name` for joins, updated lazily on first observation of each user).
- **Session revocation deferred.** noclulabs.com revokes sessions on password change via the `signedInAt < password_changed_at` check in its DB-capable session callback. noCluCal does NOT replicate that check at Phase 1, because doing so would require either a DB lookup against noclulabs (architectural violation) or an HTTP round-trip per page render (latency tax). Trade-off: a revoked noclulabs session remains valid in noCluCal until the JWT naturally expires (Auth.js default 30 days). Logged as a deferred item in ROADMAP. Options for closing the gap when there are real users: (a) noclulabs exposes a `/api/auth/validate-session` endpoint that noCluCal pings on session resolution, with caching to amortize cost; (b) promote noclulabs.com to a proper OIDC provider with token introspection.

## File Structure

```
noclucal/
  .github/
    workflows/
      ci.yml
      deploy.yml
  public/
    robots.txt
  src/
    app/
      globals.css
      layout.tsx
      page.tsx
    lib/
      version.ts
  tests/
    setup.ts
    smoke.test.ts
  .dockerignore
  .env.example
  .gitignore
  CHANGELOG.md
  CLAUDE.md
  Dockerfile
  README.md
  ROADMAP.md
  docker-compose.yml
  eslint.config.mjs
  next.config.ts
  package.json
  pnpm-lock.yaml
  postcss.config.mjs
  tsconfig.json
  vitest.config.ts
```

Phase 1b adds Drizzle + `pg` and the local Postgres compose file. Phase 1c adds the migrator stage and the `migrate` Compose profile. Phase 1d adds the Auth.js v5 RP-mode config split (`auth.config.ts`, `auth.ts`, `proxy.ts`).

## Deployment / actual state

- Live at https://cal.noclulabs.com with the placeholder homepage.
- Host port 3002 confirmed in use (portalNetwork = 3000, noclulabs = 3001, noCluCal = 3002).
- Caddy block for `cal.noclulabs.com` is live on the droplet, terminating TLS and proxying to `127.0.0.1:3002`.
- First manual deploy ops (clone to `/opt/noclucal`, create `.env`, add Caddy block) happened on 2026-05-26 alongside this PR.
- The Phase 1a `deploy.yml` runs only `git pull` + `docker compose up -d --build` + `docker image prune -f`. The `migrate` Compose profile invocation lands in Phase 1c when the first migration ships.

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

## Database (planned, Phase 1)

Database layout will be wired in Phase 1. Confirmed architectural decisions:

- **Cluster.** Same DigitalOcean Managed Postgres cluster as noclulabs (`noclulabs-postgres-prod`, Basic tier, PostgreSQL 18, SFO2, in the noCluHub VPC). Adding a database to the existing cluster is a no-op for billing and operationally simpler than a second cluster.
- **Databases.** `noclucal_dev` (local Mac via `docker-compose.dev.yml`, host port 5434 to avoid clashing with noclulabs' 5433), `noclucal_test` (CI service container, ephemeral), `noclucal_prod` (DO managed cluster). Separate databases (not schemas) for engine-enforced isolation.
- **SSL workaround (critical).** Every `DATABASE_URL` used by node-pg / drizzle-orm / drizzle-kit MUST end with `&uselibpqcompat=true`. Same reason as noclulabs: DO's self-signed cert plus node-pg's `pg-connection-string` library treating `sslmode=require` as `verify-full`. `psql` does NOT need the suffix (libpq honors `sslmode=require` correctly out of the box). The droplet ops command pattern for stripping the suffix when shelling into psql lives in noclulabs' CLAUDE.md § Database / Production; the same pattern applies here.
- **Two-URL pattern.** Public URL (Mac ops, Trusted Sources lists the developer's Mac IP) and VPC URL (droplet runtime, never leaves the VPC), both stored in Bitwarden.
- **UUID PKs.** Postgres 18 native `uuidv7()` (time-ordered, no extension required).
- **Migrations.** Drizzle migrations in `drizzle/migrations/`, append-only, applied at deploy time via the `migrate` Docker Compose profile (mirroring noclulabs' pattern).

## Auth (planned, Phase 1)

Phase 1 will wire Auth.js v5 in SSO-relying-party mode. Confirmed architectural decisions:

- **Config split.** Same edge-safe / server-only split as noclulabs: `src/auth.config.ts` (edge-safe, no `pg` / `drizzle` / `bcrypt` imports), `src/auth.ts` (extends, no providers since this is RP-only), `src/proxy.ts` (imports ONLY from `auth.config.ts`, replaces the Next.js 16 deprecated `middleware` convention). NEVER collapse to one file; the proxy compiles to the edge runtime and crashes if Node-only imports leak in.
- **No providers.** The Auth.js providers array is empty. Sign-in happens at noclulabs.com.
- **Cookie domain.** `cookies.sessionToken.options.domain = ".noclulabs.com"` so the cookie set by noclulabs.com is visible here.
- **JWT shape.** Mirrors noclulabs' augmentation: `{ id, username, role: "user" | "admin", signedInAt: number }`.
- **Env vars.** Same set as noclulabs: `AUTH_SECRET` (MUST match noclulabs' value exactly), `AUTH_URL` (`https://cal.noclulabs.com` in prod), `AUTH_TRUST_HOST=true` (required behind the Caddy reverse proxy).

## Calendar provider abstraction (planned, Phase 2)

Phase 2 introduces a `CalendarProvider` interface so the booking core never depends on a specific provider. Confirmed architectural decisions:

- **Interface.** Methods: `listBusyTimes(range)`, `createEvent(details)`, `cancelEvent(id)`, `watchChanges(callback)`. Each implementation handles its own auth (OAuth tokens, refresh, webhook subscriptions).
- **Storage.** A polymorphic `calendar_connections` table with `provider` (text discriminator) and `config` (jsonb for provider-specific data like encrypted refresh tokens and channel IDs). OAuth refresh tokens are encrypted at rest using a separate key from `AUTH_SECRET`.
- **First provider.** Google Calendar via `googleapis`. Microsoft Graph, CalDAV, and a first-party noClu calendar are post-Phase-2 work.
- **Registry pattern.** Providers register themselves in `src/lib/calendar/providers/index.ts` (analogous to noclulabs' animation registry). The booking core resolves a provider by discriminator and never branches on type.

## Deployment (planned, Phase 1)

Same shape as noclulabs and portalNetwork:

- Multi-stage `Dockerfile` (deps / build / runner / migrator stages on `node:20-alpine`).
- `docker-compose.yml` maps host port `3002` to container port `3000` (portalNetwork holds 3000, noclulabs holds 3001, noCluCal claims 3002).
- Caddy on the host terminates TLS for `cal.noclulabs.com` and proxies to `127.0.0.1:3002`.
- GitHub Actions `ci.yml` runs lint + type-check + test + build on every push and PR.
- GitHub Actions `deploy.yml` SSHs into the droplet, pulls, runs migrations via the `migrate` Compose profile, and rebuilds the web container.

Production paths on the droplet (planned):

- Repo clone: `/opt/noclucal/`
- Env file: `/opt/noclucal/.env`
- Caddy block for `cal.noclulabs.com` added to the host Caddyfile.
