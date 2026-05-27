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

Phase 0 in progress. Bible files seeded; no code yet. See `ROADMAP.md` for the planned arc.

## Getting started

Not yet runnable. Phase 1 introduces the scaffold, env template, and local dev instructions.

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
