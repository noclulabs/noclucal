# INFRA-PLAYBOOK.md

> Reference layer for noCluCal, not a bible file. This holds the deep
> infrastructure and operations rationale (the Docker build, compose topology,
> Redis and BullMQ operations, the worker process, deploy mechanics, the
> droplet environment, dependency coupling) that used to live inline in
> CLAUDE.md. It is read on demand, not loaded into every session: read it
> during ramp-up for infrastructure, deployment, and operations PRs (Docker,
> compose, the worker, the queue substrate, deploy, CI, dependency or build
> tooling), the same way CALENDAR-PLAYBOOK.md is read only for booking-core
> PRs. CLAUDE.md keeps a terse line per invariant plus a pointer here.
>
> Split this file by durable domain, never by phase. When a section here is
> contradicted by code or config, the repo wins; update this file in the same
> PR.

## Docker multi-stage build

The Dockerfile defines five stages, in this order: `deps`, `build`,
`migrator`, `worker`, `runner`. All run on `node:20-alpine`; every stage
except `runner` enables corepack for pnpm.

- **`deps`** installs the full dependency set with
  `pnpm install --frozen-lockfile`.
- **`build`** copies `node_modules` from `deps` plus the repo and runs
  `pnpm build`.
- **`migrator`** is a lightweight one-shot image carrying `node_modules`,
  `drizzle.config.ts`, `drizzle/migrations/`, and `src/lib/db/`, with
  `CMD ["pnpm", "db:migrate:deploy"]`. Not shipped in the runtime web image;
  the deploy workflow invokes it via the `migrate` Compose profile.
- **`worker`** is the long-lived BullMQ worker image: `node_modules`
  (including tsx, a regular dependency), `tsconfig.json`, and the app source,
  with `CMD ["pnpm", "worker"]`, so `src/worker.ts` runs through tsx and `@/`
  path aliases resolve from `tsconfig.json` without a bundling step.
- **`runner`** is the Next.js runtime image: the standalone output, static
  assets, and `public/` from `build`, running `node server.js` as the
  non-root `nextjs` user on container port 3000.

### Stage order is load-bearing

`docker-compose.yml`'s `web` service does NOT specify a `target:` directive,
so Docker builds the LAST stage by default. `runner` must remain the final
stage for `web` to build the Next.js runtime image. The `migrate` and
`worker` Compose services select their stages explicitly (`target: migrator`,
`target: worker`), so they are unaffected by where those stages sit in the
file as long as they exist. Any new stage goes before `runner`, never after
it; both the `migrator` and `worker` stages carry an IMPORTANT comment in the
Dockerfile to that effect.

### Failure lessons

- **Phase 1c migrator restart-loop.** 1c shipped with `migrator` as the last
  stage. The `web` service, having no `target:`, built the migrator image,
  and production restart-looped on the migrator's CMD until the stage order
  was caught and fixed. This is why `runner` stays last.
- **Phase 5a worker restart-loop on a missing `REDIS_URL`.** The worker
  builds its Redis connection at process start, so a droplet `.env` without
  `REDIS_URL=redis://redis:6379` makes the `worker` container throw
  immediately and restart-loop (`restart: unless-stopped` keeps relaunching
  it). The web container is unaffected. See the droplet environment pattern
  below.

## Compose topology

Production (`docker-compose.yml`) runs the runtime stack; dev
(`docker-compose.dev.yml`) runs only the two backing stores, with the app
processes run from the host.

### Production services

- **`web`**: the default (last) Dockerfile stage. Host port 3002 maps to
  container port 3000 (portalNetwork holds 3000, noclulabs 3001; Caddy
  terminates TLS for `cal.noclulabs.com` and proxies to `127.0.0.1:3002`).
  Reads `/opt/noclucal/.env` via `env_file` and additionally sets
  `REDIS_URL=redis://redis:6379` in compose `environment`, so later
  sub-phases can enqueue jobs from the web process without a droplet `.env`
  change. `depends_on: redis`, `restart: unless-stopped`.
- **`redis`**: `redis:7.4-alpine`, started with
  `--maxmemory-policy noeviction --appendonly yes` (see Redis and BullMQ
  operations below). Reachable only at `redis:6379` on the compose network;
  no published host port. Named volume `noclucal_redis_data` at `/data`;
  `redis-cli ping` healthcheck; `restart: unless-stopped`.
- **`worker`**: builds `target: worker` explicitly, reads the same
  `env_file`, `depends_on: redis`, `restart: unless-stopped`. Needs
  `REDIS_URL` in the droplet `.env` (see the droplet environment pattern
  below).
- **`migrate`**: builds `target: migrator`, gated behind the `migrate`
  Compose profile so it stays out of the default `docker compose up` set;
  `restart: "no"`. Invoked one-shot from the deploy workflow.

Postgres is deliberately absent from prod compose: production uses the shared
DigitalOcean Managed Postgres cluster (`noclucal_prod`), not a container.

### Dev services and the deliberate non-default host ports

`docker-compose.dev.yml` runs `postgres:18-alpine` publishing host port 5434
(noclulabs' dev Postgres holds 5433) and `redis:7.4-alpine` publishing host
port 6380 (the default 6379 is left free), so the suite's apps can run on the
same Mac without port clashes. Host-run dev processes connect to
`redis://localhost:6380` and Postgres on 5434. The dev Redis runs the same
`noeviction` plus `appendonly` flags as prod, so dev behavior matches. Both
services have healthchecks and named volumes; the Postgres volume mounts at
`/var/lib/postgresql` so PG18+ data lives under its major-version
subdirectory.

## Redis and BullMQ operations

### noeviction and appendonly, in every environment

Both Redis services, dev and prod, run
`--maxmemory-policy noeviction --appendonly yes`. BullMQ stores job state as
ordinary Redis keys, so any eviction policy that removes keys under memory
pressure would silently drop jobs; `noeviction` makes Redis refuse writes
instead, a loud failure over a silent one. `--appendonly yes` persists the
keyspace across a restart, so delayed jobs (the Phase 5d reminders) survive a
droplet reboot.

### The `noclucal` key prefix

Every queue and worker is constructed with the `noclucal` prefix
(`QUEUE_PREFIX` in `src/lib/queue/constants.ts`), so every BullMQ key is
namespaced under `noclucal:`. The Redis container is dedicated today; the
prefix keeps the keyspace isolated if Redis is ever shared with another suite
app later.

### Notifications jobs and their options

Phase 5c added the first real job, `send-confirmation` (`JOB_NAMES.SEND_CONFIRMATION`
in `src/lib/queue/constants.ts`): `confirmBooking` enqueues it best-effort after a
successful booking, and the worker renders and sends the branded confirmation
email through Resend. The payload is self-contained (exactly the
`sendConfirmationEmail` input, re-exported as `SendConfirmationJobPayload`), so
the worker does no database read.

The notifications queue sets default job options in `src/lib/queue/queues.ts`:

- **`attempts: 3` with exponential backoff** (5s base): transient Resend
  failures retry; a persistent failure exhausts its attempts and lands in the
  failed set, logged by the worker's `failed` handler.
- **`removeOnComplete: true`**: completed job payloads carry invitee PII (name,
  email, note) and must not linger in Redis after the send succeeds.
- **`removeOnFail: 100`**: a small bounded window of failed jobs stays for
  debugging; the bound keeps memory finite under the `noeviction` policy, which
  refuses writes rather than evicting when memory fills.

Resend reports API-level failures (an unverified domain, a bad sender) via
`result.error` rather than throwing, so the worker's processor raises them
explicitly; otherwise such a job would complete without a send and never retry.

### Lazy, side-effect-free connections

`src/lib/queue/connection.ts` mirrors the lazy shape of `src/lib/db/index.ts`:
importing the module has zero side effects, no connection opens until a
function is called, and a missing `REDIS_URL` throws (`REDIS_URL is not set`)
on first use, never at import. This is load-bearing for the same reason as
the DB module: Next.js's build-time page-data collection imports route
modules transitively without env vars set, and an eager connect would crash
the build.

### Connection discipline

- Every connection sets `maxRetriesPerRequest: null`. BullMQ requires it on
  any connection a Worker uses, because Workers issue blocking commands
  (BRPOPLPUSH and friends) that must not be aborted by ioredis's retry
  limiter; it is applied to every connection so the producer and worker sides
  share one option set.
- The Worker takes its own fresh connection (`createRedisConnection`):
  blocking commands monopolize a connection, so it must not share the
  producer side's socket.
- The producer side memoizes one shared connection (`getSharedConnection`),
  reused across enqueue calls so a socket is not opened per job.
- `closeRedis` quits the shared connection and clears the memo; the worker
  entry calls it during graceful shutdown.

## The worker

`src/worker.ts` is the worker process entry. It runs as its own long-lived
compose service on the `worker` Dockerfile stage, not inside the web process.

### tsx, not a bundle

The worker runs through tsx (`pnpm worker`, which is
`node --env-file-if-exists=.env.local --import tsx src/worker.ts`), so `@/`
path aliases resolve from `tsconfig.json` without a bundling step. This is
why tsx is a regular dependency, not a devDependency: the production worker
image needs it at runtime.

### `--env-file-if-exists` makes one script serve dev and prod

`--env-file-if-exists=.env.local`, rather than `--env-file`, lets the same
`pnpm worker` script work in both environments: in dev it reads `.env.local`;
in the container, where no `.env.local` exists, it reads nothing and the env
arrives through the compose `env_file` instead. A plain `--env-file` would
error on the missing file in the container.

### Graceful shutdown

`src/worker.ts` installs SIGTERM and SIGINT handlers that close the worker
(letting an in-flight job finish), quit the Redis connection via
`closeRedis`, and exit 0; a re-entrant guard makes a second signal a no-op.
Docker stop and compose restarts send SIGTERM, so a deploy does not kill a
job mid-flight. The entry also logs `ready`, per-job `failed`, and `error`
lifecycle events.

### The worker-import constraint: no `server-only` on the worker's import graph

Nothing the worker imports may use the `server-only` marker. The marker's
default export condition throws in any plain Node process, and the worker runs
through tsx without the `react-server` condition, so a `server-only` import
anywhere in the worker's transitive graph crashes the process at import time.
Running tsx with `--conditions react-server` is not a way out: that condition
breaks `react-dom/server`, which `@react-email/render` uses to render the
email templates.

This bit in Phase 5c, when the worker first imported the email send path
(Phase 5b had shipped `src/lib/email/` with `server-only` on the client and
send modules). Resolved by removing `server-only` from the email path and
dropping the dependency: the email modules are server-side by convention,
like the DB and crypto modules, and nothing client-side imports them, so the
API key stays out of client bundles. Any future module the worker must import
follows the same rule.

## Deploy mechanics

`deploy.yml` runs on every merge to `main` and SSHes to the droplet:

1. Guard: exit with a clear message if `/opt/noclucal` does not exist
   (first-time setup is manual: clone the repo, create `.env`, configure
   Caddy; first performed 2026-05-26).
2. `git pull origin main`.
3. `docker compose --profile migrate run --rm --build migrate`: migrations
   apply against `noclucal_prod` before the new web container starts.
4. `docker compose up -d --build`: rebuilds and restarts the runtime stack.
5. `docker image prune -f`.

### Idempotent migrations and deploy order

Drizzle's `__drizzle_migrations` tracking table makes step 3 idempotent:
already-applied migrations are skipped. The order (migrate, then rebuild)
suits additive migrations. For a migration that drops a column or otherwise
breaks the previous app code, flip the order for that deploy (build first,
migrate second).

### `up -d --build` picks up new services automatically

`docker compose up -d --build` builds and starts any service newly added to
`docker-compose.yml`, which is how the `redis` and `worker` services came up
in Phase 5a with no `deploy.yml` change. Adding a service therefore needs no
workflow edit, but it does need any new env key in the droplet `.env` first
(next section).

## CI

`ci.yml` runs `postgres:18-alpine` and `redis:7.4-alpine` service containers
with healthchecks, sets `DATABASE_URL` and `REDIS_URL` at the job level, and
runs `pnpm db:test:setup` (which shells out to `pnpm db:migrate:deploy`)
before lint, type-check, test, and build. The queue round-trip test runs
against the CI Redis the same way DB-touching tests run against the CI
Postgres.

## The droplet environment pattern

Configuration and secrets live in `/opt/noclucal/.env`, read by every compose
service via `env_file`. The repo never holds real values; production values
live in Bitwarden under the noClu Infrastructure folder.

The rule: any newly required key must be added to the droplet `.env` before
or with the deploy that needs it. The consuming modules load env lazily, so
the deploy itself succeeds and the failure surfaces when the key is first
touched: the consuming container throws and restart-loops (for the worker,
first touch is process start), while unrelated containers keep running.

Precedents:

- **`TOKEN_ENCRYPTION_KEY` (Phase 2d).** The OAuth callback was the first
  runtime invoker of `encryptToken`; the key had to be on the droplet before
  the first connect flow ran.
- **`REDIS_URL=redis://redis:6379` (Phase 5a).** Required by the `worker`
  service; without it the worker restart-loops. The `web` service gets its
  `REDIS_URL` from compose `environment`, not from the droplet `.env`.
- **`RESEND_API_KEY` and `EMAIL_FROM` (Phase 5c).** Required for sending now
  that the worker delivers the confirmation email. `EMAIL_FROM` must be a
  sender on a domain verified in Resend. Unlike `REDIS_URL`, a missing value
  does not crash the worker at boot: the Resend client is constructed lazily
  on first use, so the failure surfaces as a failed send job (retried with
  backoff, then logged), and the booking itself is unaffected. The sending
  domain must be verified in Resend before or with the deploy, or every send
  fails the same graceful way until it is.

### Caddy access log

The `log {}` block for `cal.noclulabs.com` was stripped from
`/etc/caddy/Caddyfile` during Phase 1a ops because `/var/log/caddy/` is not
writable by the Caddy user. Re-enable by pre-creating the log file with
`caddy:caddy` ownership first. Not blocking; access logs are nice-to-have.

## Database operations

Postgres in production is the shared DigitalOcean Managed Postgres cluster,
not a container; the schema and migration design stay in CLAUDE.md and the
schema files. The operational rules live here.

### One cluster, separate databases

Production uses the same managed cluster as noclulabs
(`noclulabs-postgres-prod`, Basic tier, PostgreSQL 18, SFO2, in the noCluHub
VPC). Adding a database to the existing cluster is a no-op for billing and
operationally simpler than a second cluster; isolation comes from separate
databases (not schemas), enforced by the engine.

### The libpqcompat SSL workaround

Every `DATABASE_URL` used by node-pg / drizzle-orm / drizzle-kit MUST end
with `&uselibpqcompat=true`. Same reason as noclulabs: DO's self-signed cert
plus node-pg's `pg-connection-string` library treating `sslmode=require` as
`verify-full`, which fails verification against the self-signed chain.
`psql` does NOT need the suffix (libpq honors `sslmode=require` correctly
out of the box). Local dev does not need the suffix either (no SSL on the
local Postgres). The workaround is identical to noclulabs' implementation;
the droplet ops command pattern for stripping the suffix when shelling into
psql lives in noclulabs' CLAUDE.md § Database / Production and applies here
verbatim.

### The two-URL pattern

Each database has two connection URLs: a public URL for Mac ops (the
cluster's Trusted Sources list includes the developer's Mac IP) and a VPC
URL for the droplet runtime, which never leaves the VPC. Both are stored in
Bitwarden under the noClu Infrastructure folder.

### Smoke tests

`pnpm db:smoke` runs `scripts/db-smoke-test.ts`, which fires
`SELECT version()`, `SELECT 1`, and `SELECT NOW()` against the pool.
`pnpm redis:smoke` runs `scripts/redis-smoke-test.ts`, the Redis analogue:
`PING`, then a `SET` / `GET` / `DEL` round trip on a throwaway key.
Permanent diagnostic infrastructure: each answers "is this backing store
reachable right now?" without depending on any schema or queue. The DB smoke
test mirrors noclulabs' equivalent; the Redis one is its local analogue.

## Dependency coupling

When we construct a client instance ourselves and pass it into a library, our
direct dependency must resolve to the exact version the library uses
internally. TypeScript compares the two classes structurally, and a protected
or private member makes two copies of the same class non-interchangeable: the
library's signature wants its own copy of the class, and ours is a different
class to the compiler.

Concretely: BullMQ accepts the ioredis connections we construct in
`src/lib/queue/connection.ts`. When bumping `bullmq`, realign the `ioredis`
pin to whatever ioredis version that `bullmq` release resolves (check
`pnpm-lock.yaml` or `pnpm why ioredis`). Phase 5a pinned `ioredis` to match
`bullmq` for exactly this reason.

Current pinned pair, as read from `package.json` and `pnpm-lock.yaml`:
`bullmq` 5.78.0, which resolves `ioredis` 5.10.1 internally, matched by our
direct `ioredis` 5.10.1 pin.
