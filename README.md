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

Phase 1a complete. Site responds at https://cal.noclulabs.com with a placeholder homepage. Phase 1b (database wiring) is next.

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
```

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
