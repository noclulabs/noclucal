# Changelog

All notable changes to noCluCal will be documented in this file. Format follows the conventional commits convention and groups changes under [Unreleased] / Added / Changed / Fixed / Removed.

## [Unreleased]

### Added

- feat(phase-1a): Next.js 16 App Router scaffold with TypeScript strict, Tailwind v4, Space Grotesk via `next/font/google`, the Indigo Signal palette duplicated from the noclulabs design system in `globals.css`, placeholder homepage at `/`, and the project structure laid out under `src/`.
- feat(phase-1a): Vitest harness with jsdom environment, `@/` path alias, and one smoke test verifying the path alias resolves correctly.
- feat(phase-1a): multi-stage Dockerfile (deps / build / runner on `node:20-alpine`) producing a standalone Next.js server image, paired with `docker-compose.yml` mapping host port 3002 to container port 3000.
- ci(phase-1a): GitHub Actions `ci.yml` runs lint, type-check, test, and build on every push and PR to `main`. `deploy.yml` auto-deploys to the DigitalOcean droplet on every push to `main` via SSH (clone, pull, rebuild). No migrate step yet (Phase 1c).
- docs(phase-1a): `.env.example` with the Auth.js v5 RP-mode variables, `.gitignore` (already from Phase 0), `robots.txt` blocking all crawlers until the booking flow ships.
- docs(phase-0): seed `CLAUDE.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md` with the architectural decisions from the design session. Captures the SSO bridge to noclulabs.com (shared cookie on `.noclulabs.com` parent domain, shared `AUTH_SECRET`, JWT shape mirrored exactly, no auth providers in noCluCal), the separate-database-in-shared-cluster decision for the DigitalOcean Managed Postgres instance, the `CalendarProvider` interface abstraction with Google as the first provider, and the deployment shape (Docker on the shared DO droplet behind Caddy on host port 3002). No code in this PR.
- chore(phase-0): standard `.gitignore` for Node + Next.js, including `.env*` exclusions.

### Fixed

- chore(phase-1a): rename `gitignore` (committed without the leading dot in Phase 0) to `.gitignore` so git actually honors the ignore rules.
