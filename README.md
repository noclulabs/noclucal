# noCluCal

Booking platform in the noClu suite. Public booking pages, calendar integration (Google first; more providers planned), email confirmations, reminders, and reschedule / cancel flows.

Identity federates from noclulabs.com via a shared-cookie SSO bridge. One noClu account works across every domain in the noClu digital estate.

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript (strict mode)
- Tailwind CSS v4
- PostgreSQL 18 via Drizzle ORM
- Redis with BullMQ for background jobs and slot holds
- Auth.js v5 (`next-auth@beta`) in SSO relying-party mode
- Luxon for timezone math
- Resend with React Email for transactional email
- `googleapis` for Google Calendar
- Docker on a DigitalOcean Droplet behind Caddy
- GitHub Actions for CI and CD

## Status

Phase 1b complete. Database connection module wired. Local dev Postgres compose available. Production DB (`noclucal_prod` in the shared DO Managed Postgres cluster) provisioned and the droplet `.env` updated. No schema or migrations yet; that lands in Phase 1c.

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 10.33.0 (the repo pins `packageManager` so tools resolve the exact version automatically)

### Setup

```bash
git clone https://github.com/noclulabs/noclucal.git
cd noclucal
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

For the SSO bridge with noclulabs.com to work in production, `AUTH_SECRET` in `.env.local` must match the noclulabs value. In dev, any random 32-byte base64 string works (generate with `openssl rand -base64 32`); the cookie domain is not set in dev mode, so local sessions stay local.

### Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
pnpm type-check   # TypeScript type checking
pnpm test         # Run Vitest suite
pnpm test:watch   # Run Vitest in watch mode
pnpm db:smoke     # Run a connectivity check against DATABASE_URL (SELECT version / 1 / NOW)
```

### Local database

PostgreSQL 18 runs locally via Docker. Spin it up before running `pnpm db:smoke` (and, once Phase 1c lands, `pnpm db:migrate` and `pnpm db:studio`):

```bash
docker compose -f docker-compose.dev.yml up -d
```

Connection string defaults match `.env.local` (host port 5434, user `noclucal`, database `noclucal_dev`). Port 5434 is deliberate; noclulabs' dev Postgres holds 5433, so both can run on the same Mac without clashing. After spinning up:

```bash
pnpm db:smoke
```

should print three successful queries and exit 0. See `CLAUDE.md` § Database for the full architectural decisions (connection module, SSL workaround, two-URL pattern).

## Bible files

This project uses four bible files as the sole continuity mechanism across Claude Code sessions:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context, stack, conventions, current state |
| `CHANGELOG.md` | All changes, conventional commit format |
| `README.md` | Setup instructions, project overview |
| `ROADMAP.md` | Planned work, version targets, future ideas |

## License

Private. All rights reserved.
