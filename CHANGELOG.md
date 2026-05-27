# Changelog

All notable changes to noCluCal will be documented in this file. Format follows the conventional commits convention and groups changes under [Unreleased] / Added / Changed / Fixed / Removed.

## [Unreleased]

### Added

- docs(phase-0): seed `CLAUDE.md`, `README.md`, `ROADMAP.md`, `CHANGELOG.md` with the architectural decisions from the design session. Captures the SSO bridge to noclulabs.com (shared cookie on `.noclulabs.com` parent domain, shared `AUTH_SECRET`, JWT shape mirrored exactly, no auth providers in noCluCal), the separate-database-in-shared-cluster decision for the DigitalOcean Managed Postgres instance, the `CalendarProvider` interface abstraction with Google as the first provider, and the deployment shape (Docker on the shared DO droplet behind Caddy on host port 3002). No code in this PR.
- chore(phase-0): standard `.gitignore` for Node + Next.js, including `.env*` exclusions.
