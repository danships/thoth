FROM node:24.18.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Turbopack's output-file tracing can conservatively include unrelated project files
# (`src`, `tests`, docs, configs, ...) into `.next/standalone` when it can't statically
# resolve a dynamic `fs`/`path` call somewhere in the server bundle (see THOTH-070; the
# build emits an "Encountered unexpected file in NFT list" warning when this happens).
# Rather than relying on that heuristic, explicitly prune `.next/standalone` down to an
# allowlist of what the standalone server actually needs at runtime, so the final image
# only ever contains the bare minimum regardless of what tracing decides to include.
# `package.json` is required at runtime: it carries `"type": "module"`, which `server.js`
# (an ES module) needs to load correctly.
RUN find .next/standalone -mindepth 1 -maxdepth 1 \
      ! -name '.next' ! -name 'node_modules' ! -name 'server.js' ! -name 'public' ! -name 'package.json' \
      -exec rm -rf {} +

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p /home/nextjs && \
    chown -R nextjs:nodejs /home/nextjs /app

ENV HOME=/home/nextjs

COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
