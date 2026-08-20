# The runtime image must be glibc-based (Debian), not Alpine/musl: THOTH-086's workspace search
# indexing depends on `@huggingface/transformers`, whose `onnxruntime-node` backend ships
# prebuilt `.node`/`.so` binaries linked against glibc. On musl (Alpine) those fail to load at
# runtime with `Error loading shared library ld-linux-x86-64.so.2: No such file or directory`
# (no dynamic loader). musl-compat shims (`gcompat`/`libc6-compat`) do not provide enough of
# glibc to run these binaries, so every stage — not just the runner — uses the `-slim` (Debian)
# variant, keeping the native modules built and run against the same libc throughout.
FROM node:24.18.0-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/jobs/package.json apps/jobs/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/job-protocol/package.json packages/job-protocol/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/jobs/package.json apps/jobs/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/job-protocol/package.json packages/job-protocol/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
# Builds the shared packages, then `@thoth/web` (Next standalone output) and `@thoth/jobs`
# (plain `tsc` output) topologically — see the root `build` script.
RUN pnpm build

FROM node:24.18.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/* && \
    groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --home-dir /home/nextjs --no-create-home nextjs && \
    mkdir -p /home/nextjs /app/run /app/logs && \
    chmod 0700 /app/run && \
    chown -R nextjs:nodejs /home/nextjs /app

ENV HOME=/home/nextjs

# The monorepo's `outputFileTracingRoot` (see apps/web/next.config.ts) makes Next.js emit the
# standalone output nested under the traced workspace root: the traced dependency tree lands
# at `apps/web/.next/standalone/node_modules` (the standalone tree's *root*), and
# `apps/web/.next/standalone/apps/web/` holds `server.js` plus its own `node_modules` full of
# *relative* symlinks back into that top-level `node_modules` (e.g.
# `apps/web/.next/standalone/apps/web/node_modules/next ->
# ../../../node_modules/.pnpm/next@.../node_modules/next`, itself calibrated for the exact
# nesting depth `standalone/apps/web/node_modules/`). Copy the full production `node_modules`
# from `deps` first (covers native modules like `better-sqlite3` that output file tracing can
# miss the binary for, and provides `pm2`/`pm2-runtime`), then copy `standalone/` as a whole —
# preserving that same nesting intact — so those relative symlinks keep resolving correctly.
# Flattening `apps/web/` straight into `/app` (as this image used to) shifts the symlinks'
# relative depth by one level and breaks `node server.js` with `Cannot find module 'next'` /
# `Cannot find module '@swc/helpers/...'`.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# The migration CLI (THOTH-058) is not part of the Next.js app and isn't picked up by output
# file tracing, so it's copied explicitly and run once, before PM2 starts, via
# `scripts/start-production.mjs`. A migration failure must prevent both PM2 children from
# starting.
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/package.json ./packages/database/package.json
# packages/database/node_modules holds the workspace-local symlinks (e.g. `supersave`) that
# pnpm creates pointing into the root node_modules' content-addressable store. Node resolves
# `require('supersave')` from packages/database/dist/context.js by walking up through
# packages/database/node_modules first, so without this the migration CLI above fails at
# runtime with `Cannot find module 'supersave'` even though root node_modules is present.
COPY --from=builder --chown=nextjs:nodejs /app/packages/database/node_modules ./packages/database/node_modules
# `@thoth/shared`'s compiled output — `@thoth/database` (see packages/database/src/history/
# revision-service.ts) imports the pure history algorithms extracted into this package, so it
# must be present at runtime for the migration CLI and the web/jobs processes that depend on
# `@thoth/database`.
COPY --from=builder --chown=nextjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
# `@thoth/storage`'s compiled output — `@thoth/jobs` (see apps/jobs/src/storage-context.ts,
# THOTH-063) imports this package directly for maintenance jobs, so it must be present at
# runtime alongside the other workspace packages traced above.
COPY --from=builder --chown=nextjs:nodejs /app/packages/storage/dist ./packages/storage/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/storage/package.json ./packages/storage/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/storage/node_modules ./packages/storage/node_modules
# `@thoth/job-protocol`'s compiled output — required both by `@thoth/jobs` (via its own
# `node_modules/@thoth/job-protocol` workspace symlink, copied below) and by the health check
# code traced into the web standalone bundle above.
COPY --from=builder --chown=nextjs:nodejs /app/packages/job-protocol/dist ./packages/job-protocol/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/job-protocol/package.json ./packages/job-protocol/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/job-protocol/node_modules ./packages/job-protocol/node_modules
# `@thoth/jobs` (THOTH-059/THOTH-060) — the second PM2-managed process. Deliberately imports no
# Next.js/web/database module and opens no TCP/HTTP port; its `node_modules` carries only its
# own workspace-local symlinks (e.g. `@thoth/job-protocol` -> ../../../packages/job-protocol).
COPY --from=builder --chown=nextjs:nodejs /app/apps/jobs/dist ./apps/jobs/dist
COPY --from=builder --chown=nextjs:nodejs /app/apps/jobs/package.json ./apps/jobs/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/jobs/node_modules ./apps/jobs/node_modules
# PM2 process file and the migration-then-`pm2-runtime` bootstrap entrypoint (THOTH-060).
COPY --from=builder --chown=nextjs:nodejs /app/pm2.config.js ./pm2.config.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-production.mjs ./scripts/start-production.mjs
# `ensure-vapid-keys.mjs` (THOTH-071) is imported by `start-production.mjs` to generate/persist
# VAPID keys for Web Push before PM2 starts; it must be copied alongside the entrypoint or
# startup fails with ERR_MODULE_NOT_FOUND.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/ensure-vapid-keys.mjs ./scripts/ensure-vapid-keys.mjs
# .next/standalone already contains server.js and a trimmed node_modules tree.
# Turbopack's file tracing can pull in source/config artefacts; delete them here.
RUN rm -rf apps/web/src apps/web/tests apps/web/scripts \
        apps/web/Dockerfile apps/web/Dockerfile.preview \
        apps/web/commitlint.config.cjs apps/web/eslint.config.mjs apps/web/lint-staged.config.js \
        apps/web/playwright.config.ts apps/web/tsconfig.json apps/web/tsconfig.tsbuildinfo \
        apps/web/vitest.unit.config.ts apps/web/vitest.integration.config.ts \
        apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml apps/web/next.config.ts \
        docker-compose.yml docker-entrypoint.sh \
        AGENTS.md README.md TECH_DEBT.md docs \
        *.md db.sqlite db.sqlite-shm db.sqlite-wal 2>/dev/null || true

USER nextjs

# `/app/run` is the short, writable, private (0700) parent directory for the `@thoth/jobs`
# Unix domain socket (see `apps/jobs/src/socket/server.ts`, which itself enforces the socket
# file's own 0600 mode on bind). It is ephemeral — not part of any persisted volume — and
# recreated on every container start. Only Next.js binds a TCP port (0.0.0.0:3000); `@thoth/jobs`
# has no TCP/HTTP listener and this image exposes no additional port.
ENV JOB_SOCKET_PATH=/app/run/jobs.sock

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Runs the standalone migration CLI once, then execs `pm2-runtime` (foreground, signal-
# forwarding) against `pm2.config.js`, which supervises exactly one `thoth-jobs` and one
# `thoth-web` process (THOTH-060). No shell remains as an unforwarding PID 1.
CMD ["node", "scripts/start-production.mjs"]
