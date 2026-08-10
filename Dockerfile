FROM node:24.18.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

FROM base AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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

# .next/standalone already contains server.js and a trimmed node_modules tree.
# Turbopack's file tracing can pull in source/config artefacts; delete them here.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN rm -rf src tests scripts \
        Dockerfile Dockerfile.preview \
        commitlint.config.cjs eslint.config.mjs lint-staged.config.js \
        playwright.config.ts tsconfig.json tsconfig.tsbuildinfo \
        vitest.unit.config.ts vitest.integration.config.ts \
        pnpm-lock.yaml pnpm-workspace.yaml next.config.ts \
        docker-compose.yml docker-entrypoint.sh \
        AGENTS.md README.md TECH_DEBT.md docs \
        *.md db.sqlite db.sqlite-shm db.sqlite-wal

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
