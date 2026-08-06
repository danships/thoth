FROM node:24.18.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.18.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p /home/nextjs && \
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
# miss the binary for), then copy `standalone/` as a whole — preserving that same nesting
# intact — so those relative symlinks keep resolving correctly. Flattening `apps/web/`
# straight into `/app` (as this image used to) shifts the symlinks' relative depth by one
# level and breaks `node server.js` with `Cannot find module 'next'` /
# `Cannot find module '@swc/helpers/...'`.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
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
WORKDIR /app/apps/web

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
