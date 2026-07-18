FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate

FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Ensure pnpm never prompts interactively (e.g. to purge node_modules) when
# `pnpm run db:seed` is executed non-interactively via `docker exec` during
# preview environment provisioning, since no TTY is attached in that context.
ENV CI=true

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
# Overwrite the minimal, traced package.json from the standalone build with the
# full one, and copy the full source tree (not just the seed script), so
# `pnpm run db:seed` is runnable in the running container, e.g. for preview
# environment provisioning. The seed script imports from `@/lib` and `@/types`
# via tsx path aliases, so those source directories must also be present, not
# just src/scripts.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
# Also copy the lockfile and workspace config so a `pnpm install` executed
# inside the running container (e.g. to add devDependencies like `tsx` before
# running the seed script) resolves against the same locked versions and
# respects the `onlyBuiltDependencies` build-script allowlist, instead of
# failing with ERR_PNPM_IGNORED_BUILDS.
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Copy tsconfig.json so `tsx` can resolve the `@/*` path aliases used by the
# seed script (and its imports) when it is executed directly in the running
# container. Without it, tsx has no path-mapping config and fails with
# ERR_MODULE_NOT_FOUND for aliased imports like `@/lib`.
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# Persist the container's runtime env vars to /app/.env on startup (see
# docker-entrypoint.sh) so a later `docker exec ... pnpm run db:seed` can
# load them via `dotenv/config`, even though that separate exec session
# does not reliably inherit the runtime environment on its own.
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
