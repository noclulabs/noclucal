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

Phase 3f complete. The settings area is now a navigable shell: a left sidebar over all of `cal.noclulabs.com/settings`, an overview home with at-a-glance status for the calendar connection, event types, and availability, sign-out, and sections for event types, availability, and calendars. Users signed into noclulabs.com can connect a Google Calendar account at `cal.noclulabs.com/settings/calendars`, see the connected email, and disconnect at any time. Tokens are encrypted at rest in `calendar_connections` via AES-256-GCM. Signed-in users can create, edit, and delete event types at `cal.noclulabs.com/settings/event-types`: name, slug, description, durations and buffers, booking window, color, and an enabled toggle, all validated server-side. They can set a weekly availability schedule and their booking timezone at `cal.noclulabs.com/settings/availability`: per-weekday time ranges with add, remove, and copy-to-all-days, and an IANA timezone picker, all validated server-side. On the same page they can add date-specific overrides: block a single date, or give it custom hours that replace the weekly schedule for that day. The slot computation engine that turns event types and availability into bookable slots is implemented and tested. This closes the required Phase 3 scope; an optional live slot preview is the remaining Phase 3 step, and the public booking pages come in Phase 4.

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
pnpm db:generate  # Generate a new migration from schema diffs
pnpm db:migrate   # Apply pending migrations to DATABASE_URL
pnpm db:studio    # Open Drizzle Studio against DATABASE_URL
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

### Migrations

Schema lives in `src/lib/db/schema/`. To add or change a table:

```bash
# 1. Edit the schema file(s) under src/lib/db/schema/.
# 2. Generate the migration SQL.
pnpm db:generate
# 3. Inspect the generated file under drizzle/migrations/. If you added a
#    Postgres extension (citext, pgcrypto, etc.), hand-edit the file to
#    prepend `CREATE EXTENSION IF NOT EXISTS <name>;\n--> statement-breakpoint`
#    above the first statement that depends on it. Drizzle does not
#    auto-generate extension creation.
# 4. Apply the migration locally.
pnpm db:migrate
```

In production, migrations apply automatically on every merge to `main`: `deploy.yml` runs the `migrate` Compose profile before rebuilding the web container. Drizzle's `__drizzle_migrations` tracking table makes this idempotent.

## Bible files

This project uses four bible files as the sole continuity mechanism across Claude Code sessions:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context, stack, conventions, current state |
| `CHANGELOG.md` | All changes, conventional commit format |
| `README.md` | Setup instructions, project overview |
| `ROADMAP.md` | Planned work, version targets, future ideas |

A separate `CALENDAR-PLAYBOOK.md` is a read-on-demand reference layer, not a bible file. It holds the deep per-feature design rationale for the booking core (calendar internals, slot computation, event types, availability) so CLAUDE.md stays under its context budget. Reference files are split by durable domain, never by phase; the bible set stays at four.

## License

Private. All rights reserved.
