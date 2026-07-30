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
