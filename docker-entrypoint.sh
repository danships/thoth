#!/bin/sh
# Persist the container's runtime environment variables to a `.env` file
# before starting the app.
#
# The main `node server.js` process gets variables like `DB` and
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

env | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | grep -v -E '^(HOME|PATH|PWD|HOSTNAME|SHLVL|OLDPWD|_)=' > /app/.env

exec "$@"
