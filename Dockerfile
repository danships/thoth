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
# `outputFileTracingRoot` makes the standalone output's `apps/web/node_modules/next` (and the
# native-module symlinks under `apps/web/.next/node_modules/*`) relative symlinks calibrated
# for their original nesting depth (`apps/web/.next/standalone/apps/web/...`, i.e. two levels
# below `apps/web/.next/standalone/`). The `runner` stage below flattens
# `.next/standalone/apps/web` directly into `/app`, which is only *one* level below
# `.next/standalone/`'s copied `node_modules` — shifting every such symlink's relative target
# outside of `/app` entirely (e.g. `next` would resolve to `/node_modules/...`, which doesn't
# exist) and breaking `node server.js` with `Cannot find module 'next'`. Dereferencing the
# `apps/web` symlinks alone (`cp -rL`) isn't enough though: `next`'s own peer-resolved
# dependencies (`@swc/helpers`, `react`, `react-dom`, `styled-jsx`, ...) live as *siblings* of
# `next` inside pnpm's `next@<version>_.../node_modules/` scope, not underneath
# `apps/web/node_modules/next` itself, so Node's directory-walk module resolution never finds
# them post-flatten either (`Cannot find module '@swc/helpers/...'`). Merge that whole sibling
# scope into the dereferenced `apps/web/node_modules` too, so it flattens into the same
# resolvable `node_modules` next expects alongside itself.
RUN cp -rL apps/web/.next/standalone/apps/web /tmp/standalone-web && \
    NEXT_PNPM_DIR=$(find apps/web/.next/standalone/node_modules/.pnpm -maxdepth 1 -iname 'next@*' | head -1) && \
    cp -rL "$NEXT_PNPM_DIR/node_modules/." /tmp/standalone-web/node_modules/ && \
    rm -rf apps/web/.next/standalone/apps/web && \
    mv /tmp/standalone-web apps/web/.next/standalone/apps/web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p /home/nextjs && \
    chown -R nextjs:nodejs /home/nextjs /app

ENV HOME=/home/nextjs

# The monorepo's `outputFileTracingRoot` (see apps/web/next.config.ts) makes Next.js emit the
# standalone server nested under the traced workspace root, i.e.
# `apps/web/.next/standalone/apps/web/server.js`, with its own pruned `node_modules` alongside
# it (`apps/web/.next/standalone/node_modules`). Copy the full production `node_modules` from
# `deps` first (covers native modules like `better-sqlite3` that output file tracing can miss
# the binary for), then layer the standalone tree's traced `node_modules` and server files on
# top, flattening into the same one-process layout the single-package build used to produce.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
