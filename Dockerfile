# syntax=docker/dockerfile:1
ARG NODE_VERSION=20-alpine

# ---- deps stage ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build stage ----
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runner stage ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

# ---- migrator stage ----
# Lightweight image that carries node_modules + drizzle-kit + drizzle/migrations
# + drizzle.config.ts + src/lib/db/. Runs `pnpm db:migrate:deploy` as its default
# command. NOT shipped in the runtime web image; invoked separately from
# the deploy workflow via the `migrate` Compose profile.
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
COPY drizzle.config.ts ./
COPY drizzle/migrations ./drizzle/migrations
COPY src/lib/db ./src/lib/db
CMD ["pnpm", "db:migrate:deploy"]
