#!/bin/sh
# Wrapper for `pnpm run db:seed`.
#
# In the preview environment, this script is invoked via a separate `docker
# exec` session against a container that has no `USER` directive (see
# Dockerfile.preview), so `docker exec` defaults to running as root — unlike
# the main app process, which drops privileges to the unprivileged `nextjs`
# user via `su-exec` at container start (see docker-entrypoint.sh).
#
# If the seed script's SQLite connection is opened as root, any auxiliary
# files it creates or rewrites (the `-wal`/`-shm` files used in WAL journal
# mode) end up owned by root. The main app process (running as `nextjs`)
# can then no longer write to those files, and every subsequent write —
# including creating a user account through better-auth — fails with
# "SQLITE_READONLY: attempt to write a readonly database".
#
# Guard against this by dropping to the `nextjs` user (via `su-exec`, only
# installed in the preview image) before running the seed script whenever
# we're invoked as root. Re-assert ownership of `/data` first, in case a
# fresh bind mount/volume was created as root by the container runtime.
set -e

if [ "$(id -u)" = '0' ] && command -v su-exec >/dev/null 2>&1; then
  [ -d /data ] && chown -R nextjs:nodejs /data
  exec su-exec nextjs tsx src/scripts/seed.ts
fi

exec tsx src/scripts/seed.ts
