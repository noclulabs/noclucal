# noCluCal

Booking platform in the noClu suite. Public booking pages, calendar integration (Google first; more providers planned), email confirmations, reminders, and reschedule / cancel flows.

Identity federates from noclulabs.com via a shared-cookie SSO bridge. One noClu account works across every domain in the noClu digital estate.

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript (strict mode)
- Tailwind CSS v4
- PostgreSQL 18 via Drizzle ORM
- Redis with BullMQ for background jobs
- Auth.js v5 (`next-auth@beta`) in SSO relying-party mode
- Luxon for timezone math
- Resend with React Email for transactional email
- `googleapis` for Google Calendar
- Docker on a DigitalOcean Droplet behind Caddy
- GitHub Actions for CI and CD

## Status

Phase 4 complete. Booking works end to end. The settings area is a navigable shell: a left sidebar over all of `cal.noclulabs.com/settings`, an overview home with at-a-glance status for the calendar connection, event types, and availability, sign-out, and sections for event types, availability, and calendars. Users signed into noclulabs.com can connect a Google Calendar account at `cal.noclulabs.com/settings/calendars`, see the connected email, and disconnect at any time. Tokens are encrypted at rest in `calendar_connections` via AES-256-GCM. Signed-in users can create, edit, and delete event types at `cal.noclulabs.com/settings/event-types`: name, slug, description, durations and buffers, booking window, color, and an enabled toggle, all validated server-side. Each event type there now shows its shareable public booking link with a copy button. Users can set a weekly availability schedule and their booking timezone at `cal.noclulabs.com/settings/availability`: per-weekday time ranges with add, remove, and copy-to-all-days, and an IANA timezone picker, plus date-specific overrides (block a single date, or give it custom hours that replace the weekly schedule for that day), all validated server-side. Visitors open a host's public booking page at `cal.noclulabs.com/[username]/[slug]`, browse the host's available times in their own timezone (grouped by day, with a timezone selector), and complete a booking: pick a time, fill in name, email, and an optional note, and confirm. The page only offers times it could verify against the host's connected calendar. On confirmation the booking is recorded, an event is created on the host's Google Calendar with a Google Meet link, and the invitee receives two emails: Google's own calendar invitation (carrying the Meet link) and a branded noCluCal confirmation, sent through Resend by a background worker so a notification hiccup never affects the booking; the page shows an in-place confirmation naming the invitee email. If the chosen time was taken in the meantime, the page asks the invitee to pick another. The root `/` redirects into the app. Reminder emails (Phase 5d) and reschedule / cancel (Phase 6) are still ahead.

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

`RESEND_API_KEY` and `EMAIL_FROM` configure the branded transactional emails (Resend with React Email). Both are required in production now that sending is live (Phase 5c); `EMAIL_FROM` must be a sender on a domain verified in Resend. A missing value fails the send job gracefully and never breaks a booking. In dev, dummy values are fine: the test suite mocks the Resend client and nothing sends locally.

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
pnpm redis:smoke  # Run a connectivity check against REDIS_URL (PING + set/get/del round trip)
pnpm worker       # Run the BullMQ notifications worker (Ctrl-C for a graceful shutdown)
```

### Local database

PostgreSQL 18 and Redis 7 run locally via Docker. One command spins up both:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Connection string defaults match `.env.local` (Postgres on host port 5434, user `noclucal`, database `noclucal_dev`). Port 5434 is deliberate; noclulabs' dev Postgres holds 5433, so both can run on the same Mac without clashing. After spinning up:

```bash
pnpm db:smoke
```

should print three successful queries and exit 0. See `CLAUDE.md` § Database for the full architectural decisions (connection module, SSL workaround, two-URL pattern).

### Local Redis

Redis backs BullMQ (background jobs, rate limiting). The dev `docker compose -f docker-compose.dev.yml up -d` above already starts it on host port 6380 (deliberate; the default 6379 is left free), with `noeviction` and `appendonly` set so BullMQ keys are never evicted and delayed jobs survive a restart. Set `REDIS_URL=redis://localhost:6380` in `.env.local` (it ships in `.env.example`), then:

```bash
pnpm redis:smoke
```

should print a successful `PING` and a set/get/del round trip. Run the worker with `pnpm worker`; it logs "notifications worker ready" and shuts down cleanly on Ctrl-C. See `INFRA-PLAYBOOK.md` for the queue and worker design.

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

Two read-on-demand reference layers sit beside the bibles, split by durable domain: `CALENDAR-PLAYBOOK.md` holds the deep design rationale for the booking core (calendar internals, slot computation, event types, availability), and `INFRA-PLAYBOOK.md` holds the infrastructure and operations rationale (Docker, compose, Redis and BullMQ, the worker, deploy, the droplet environment, dependency coupling). Neither is a bible file; they keep CLAUDE.md under its context budget. Reference files are split by durable domain, never by phase; the bible set stays at four.

## License

Private. All rights reserved.
