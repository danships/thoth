import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

/**
 * Production/preview bootstrap for the combined web+jobs image (THOTH-060).
 *
 * This is the *only* authoritative production start path: it runs the standalone migration CLI
 * (THOTH-058) exactly once, then execs `pm2-runtime` against the root `pm2.config.js`, which
 * supervises exactly one `thoth-web` (Next.js standalone) and one `thoth-jobs`
 * (`@thoth/jobs`) process. Neither PM2 child re-runs migrations on restart — both always open
 * the database with schema sync/migrations disabled (`skipSync: true`, see
 * `apps/web/src/lib/database/index.ts` and `packages/database/src/context.ts`); `@thoth/jobs`
 * never touches the application database at all.
 *
 * A migration failure aborts before PM2 starts, so neither child ever starts against an
 * un-migrated/partially-migrated schema. Runs entirely via `spawnSync`/`spawn` argv arrays —
 * never a shell string — so no part of the environment can be interpreted as shell syntax.
 */

const repositoryRoot = path.resolve(import.meta.dirname, '..');

/**
 * Runs the standalone database migration CLI. Reads only `process.env['DB']`; a non-zero exit
 * aborts startup before PM2 (and therefore both long-running processes) ever starts.
 */
function runMigrations() {
  const migrateEntrypoint = path.join(repositoryRoot, 'packages', 'database', 'dist', 'cli', 'migrate.js');

  if (!existsSync(migrateEntrypoint)) {
    console.error(`Migration CLI not found at ${migrateEntrypoint}; aborting startup.`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }

  console.log('Running database migrations...');
  const result = spawnSync('node', [migrateEntrypoint], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error('Failed to spawn migration CLI:', result.error.message);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('Database migration failed; aborting startup.');
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(result.status ?? 1);
  }
}

/**
 * Starts `pm2-runtime` in the foreground against the root `pm2.config.js`. `pm2-runtime` (unlike
 * plain `pm2 start`) runs in the foreground and forwards container signals to its managed
 * processes, so it is safe as the final foreground process of an exec-compatible container
 * entrypoint — no shell remains between the container runtime and PM2 to swallow signals.
 */
function startPm2Runtime() {
  const pm2ConfigPath = path.join(repositoryRoot, 'pm2.config.js');
  const pm2RuntimeBin = path.join(repositoryRoot, 'node_modules', '.bin', 'pm2-runtime');

  if (!existsSync(pm2RuntimeBin)) {
    console.error(`pm2-runtime binary not found at ${pm2RuntimeBin}; aborting startup.`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }

  console.log('Starting pm2-runtime...');
  const child = spawn(pm2RuntimeBin, ['start', pm2ConfigPath], {
    stdio: 'inherit',
    env: process.env,
  });

  // Forward container signals (e.g. `docker stop` sends SIGTERM) to pm2-runtime so it can, in
  // turn, gracefully stop `thoth-jobs` (drain claims, close the socket) and `thoth-web` before
  // this wrapper process exits.
  const forwardSignal = (signal) => {
    child.kill(signal);
  };
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGINT', () => forwardSignal('SIGINT'));

  child.on('error', (error) => {
    console.error('Failed to start pm2-runtime:', error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(code ?? (signal ? 1 : 0));
  });
}

runMigrations();
startPm2Runtime();
