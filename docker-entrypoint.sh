#!/bin/sh
# This entrypoint is only valid for a preview image build (see
# Dockerfile.preview) — it seeds data via `pnpm run db:seed` and must never
# be used for the production image built from the standard `Dockerfile`.
#
# Persist the container's runtime environment variables to a `.env` file
# before starting the app.
#
# The migration-then-PM2 bootstrap (`scripts/start-production.mjs`, run via the image's CMD)
# and the `thoth-web`/`thoth-jobs` processes it starts get variables like `DB` and
# `BETTER_AUTH_SECRET` directly from the container's runtime environment
# (e.g. set via `docker run -e` / compose `environment:`), so it works fine.
#
# However, `pnpm run db:seed` is executed later via a *separate* `docker
# exec` invocation (during preview environment provisioning), which does not
# reliably inherit that same runtime environment. The seed script loads
# `dotenv/config` to pick up a `.env` file instead, but no such file exists
# unless we create one. Writing the current environment out here, once, at
# container start, guarantees that file is present for any later `docker
# exec` session in this container to load via `dotenv/config`.
set -e

# Preview environments are single, self-contained containers with no
# external database provisioned for them by the deploy tooling, so `DB` is
# not guaranteed to be set. Default it to a local SQLite file under `/data`
# (created and chowned to the runtime user at build time, see
# Dockerfile.preview) so both this process and the later `pnpm run db:seed`
# invocation (which reads `DB` from the `.env` file written below) have a
# working value. `docker run -e DB=...` still takes precedence if the deploy
# tooling does supply one.
: "${DB:=sqlite:///data/thoth.db}"
export DB

env | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | grep -v -E '^(HOME|PATH|PWD|HOSTNAME|SHLVL|OLDPWD|_)=' > /app/apps/web/.env

# The container starts as root (no `USER` directive in Dockerfile.preview)
# specifically so this can run: the preview deploy tooling may mount `/data`
# from a fresh host directory or named volume for persistence across
# container recreations, and Docker creates those as root-owned, which would
# make the built-in chown from the image build (see Dockerfile.preview)
# ineffective and cause SQLite's `unable to open database file` on first
# deploy. Re-assert ownership here, on every start, before dropping
# privileges to the unprivileged `nextjs` user the app actually runs as.
if [ "$(id -u)" = '0' ]; then
  chown -R nextjs:nodejs /data
  # The host-side deploy tooling (running as a separate, unprivileged host
  # user outside this container) also writes a `.seeded` marker file
  # directly into this same bind-mounted `/data` directory once `pnpm run
  # db:seed` has completed, to avoid re-seeding on subsequent deploys.
  # Since the chown above makes `/data` owned by the containerised
  # `nextjs` user/group (uid/gid 1001), that host user would otherwise get
  # a "Permission denied" trying to create a file there. Make the
  # directory itself (not its contents) world-writable so any host user
  # can create that marker file alongside the app's own data.
  chmod 777 /data
  chown nextjs:nodejs /app/apps/web/.env
  exec su-exec nextjs "$@"
fi

exec "$@"
