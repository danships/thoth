// Root PM2 process file (THOTH-060). Declares the two long-running production processes for
// the combined web+jobs image: one Next.js standalone web server and one `@thoth/jobs`
// Unix-socket worker. Both run as single fork-mode instances — the queue is single-process
// (THOTH-059) and the web/session/SQLite topology has not been designed for PM2 cluster mode —
// so `instances: 1` is explicit on both and neither app may be switched to `exec_mode:
// 'cluster'`.
//
// This file is intentionally plain CommonJS (`module.exports`, not `.mjs`/ESM): `pm2-runtime`
// loads config files with Node's CJS loader.
//
// `scripts/start-production.mjs` runs the one-shot migration *before* `pm2-runtime` starts, so
// neither app here calls the migration CLI itself, and both open the database with schema
// sync/migrations disabled (`SUPERSAVE_SKIP_SYNC=true`, see `apps/web/src/lib/database/index.ts`
// and `packages/database/src/context.ts`) — a PM2-triggered restart of either process must never
// re-run migrations.
const path = require('node:path');

// Longer than `JOB_SHUTDOWN_TIMEOUT_MS` (default 10s, see `apps/jobs/src/environment.ts`) so PM2
// gives the jobs process enough time to stop accepting claims/close its socket/await in-flight
// work before SIGKILL — otherwise PM2's default `kill_timeout` (1600ms) would force-kill it
// mid-shutdown on every deploy/restart.
const JOBS_KILL_TIMEOUT_MS = 15_000;
const WEB_KILL_TIMEOUT_MS = 10_000;

const sharedRestartPolicy = {
  autorestart: true,
  restart_delay: 1000,
  min_uptime: '10s',
  max_restarts: 10,
};

module.exports = {
  apps: [
    {
      name: 'thoth-jobs',
      script: path.join(__dirname, 'apps', 'jobs', 'dist', 'index.js'),
      cwd: path.join(__dirname, 'apps', 'jobs'),
      exec_mode: 'fork',
      instances: 1,
      // `@thoth/jobs` signals readiness via `process.send('ready')` only after DB connection,
      // expired-lease recovery, scheduler init, and the secure socket bind/chmod complete (see
      // `apps/jobs/src/index.ts`) — PM2 must wait for that signal, not just process spawn,
      // before considering this app up.
      wait_ready: true,
      listen_timeout: 15_000,
      kill_timeout: JOBS_KILL_TIMEOUT_MS,
      merge_logs: true,
      out_file: path.join(__dirname, 'logs', 'thoth-jobs-out.log'),
      error_file: path.join(__dirname, 'logs', 'thoth-jobs-error.log'),
      env: {
        NODE_ENV: 'production',
      },
      ...sharedRestartPolicy,
    },
    {
      name: 'thoth-web',
      // Verified path of the Next.js standalone server as copied into the runner image (see
      // `Dockerfile`/`Dockerfile.preview`): `output: 'standalone'` plus this repo's
      // `outputFileTracingRoot` (`apps/web/next.config.ts`) nests the traced workspace root
      // under `.next/standalone`, so the entrypoint lands at `apps/web/server.js` relative to
      // that standalone root, not `apps/web/.next/standalone/server.js`.
      script: path.join(__dirname, 'apps', 'web', 'server.js'),
      cwd: path.join(__dirname, 'apps', 'web'),
      exec_mode: 'fork',
      instances: 1,
      // Next's own HTTP listener is the readiness signal; no `wait_ready` needed here.
      kill_timeout: WEB_KILL_TIMEOUT_MS,
      merge_logs: true,
      out_file: path.join(__dirname, 'logs', 'thoth-web-out.log'),
      error_file: path.join(__dirname, 'logs', 'thoth-web-error.log'),
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT ?? '3000',
        HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0',
      },
      ...sharedRestartPolicy,
    },
  ],
};
