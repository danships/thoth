import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Full-stack development harness (THOTH-060). Orchestrates, in order:
 *   1. Build the shared Node packages `@thoth/database`/`@thoth/storage`/`@thoth/job-protocol`
 *      (via the `predev` hook, which pnpm runs automatically before this script).
 *   2. Run the standalone migration CLI once (THOTH-058) — the schema must already exist before
 *      either long-running process starts, since both open the database with sync disabled.
 *   3. Start `@thoth/jobs` against a harness-owned, short-lived Unix socket path.
 *   4. Probe that socket with a real protocol `ping` (never a blocking sleep) until it responds.
 *   5. Start `next dev --turbopack`, with the same `JOB_SOCKET_PATH` so `/api/health` can reach
 *      the jobs process.
 *
 * Uses fail-fast child orchestration: if either child exits/fails, the other is stopped and this
 * process exits non-zero. Ctrl-C (SIGINT) and SIGTERM are forwarded to both children. Only the
 * harness-owned socket/temp directory is removed on exit — never anything the user configured.
 *
 * For targeted UI-only debugging with an externally supplied jobs service, use `pnpm dev:web`
 * directly (`/api/health` correctly reports jobs as unavailable if `JOB_SOCKET_PATH` isn't set to
 * point at a running instance).
 */

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const PING_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 250;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: repositoryRoot, ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }
}

async function waitForJobsReady(socketPath) {
  const { pingJobService } = await import(path.join(repositoryRoot, 'packages', 'job-protocol', 'dist', 'index.js'));

  const deadline = Date.now() + PING_TIMEOUT_MS;
  // Poll with a real protocol ping instead of a blocking sleep — connect/response failures
  // (worker still starting) are expected and simply retried until the deadline.
  while (Date.now() < deadline) {
    try {
      const response = await pingJobService({ socketPath, connectTimeoutMs: 1000, responseTimeoutMs: 1000 });
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet — retry.
    }
    await new Promise((resolve) => setTimeout(resolve, PING_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for @thoth/jobs to become ready on ${socketPath}`);
}

async function main() {
  console.log('[dev] Running database migrations...');
  run('pnpm', ['run', 'db:migrate']);

  const socketDirectory = await mkdtemp(path.join(tmpdir(), 'thoth-dev-'));
  const socketPath = path.join(socketDirectory, 'jobs.sock');

  let jobsChild;
  let webChild;
  let shuttingDown = false;
  let exitCode = 0;

  const cleanup = async () => {
    await rm(socketDirectory, { recursive: true, force: true }).catch(() => undefined);
  };

  const shutdown = async (signal, code) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    exitCode = code;
    jobsChild?.removeAllListeners('exit');
    webChild?.removeAllListeners('exit');
    if (signal) {
      jobsChild?.kill(signal);
      webChild?.kill(signal);
    } else {
      jobsChild?.kill('SIGTERM');
      webChild?.kill('SIGTERM');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await cleanup();
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(exitCode);
  };

  process.on('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));

  console.log(`[dev] Starting @thoth/jobs on ${socketPath}...`);
  const jobsTsxBin = path.join(repositoryRoot, 'apps', 'jobs', 'node_modules', '.bin', 'tsx');
  // Spawn `tsx` directly (rather than `pnpm --filter @thoth/jobs dev`) so signals sent to this
  // child reach the actual jobs process without depending on an intermediate pnpm wrapper to
  // forward them — pnpm does not reliably propagate signals to its own child on all platforms,
  // which can otherwise leave an orphaned jobs process/socket behind after Ctrl-C.
  jobsChild = spawn(jobsTsxBin, ['watch', 'src/index.ts'], {
    stdio: 'inherit',
    cwd: path.join(repositoryRoot, 'apps', 'jobs'),
    env: { ...process.env, NODE_ENV: 'development', JOB_SOCKET_PATH: socketPath },
  });
  jobsChild.on('error', (error) => {
    console.error('[dev] Failed to start jobs:', error);
  });
  jobsChild.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] @thoth/jobs exited unexpectedly (code ${code}); stopping web.`);
      void shutdown(undefined, code ?? 1);
    }
  });

  try {
    await waitForJobsReady(socketPath);
  } catch (error) {
    console.error('[dev]', error.message);
    await shutdown('SIGTERM', 1);
    return;
  }

  console.log('[dev] @thoth/jobs is ready. Starting next dev...');
  const nextBin = path.join(repositoryRoot, 'apps', 'web', 'node_modules', '.bin', 'next');
  webChild = spawn(nextBin, ['dev', '--turbopack'], {
    stdio: 'inherit',
    cwd: path.join(repositoryRoot, 'apps', 'web'),
    // Long-running e2e/dev sessions can otherwise exhaust the default V8 heap over hundreds of
    // Turbopack HMR/compile cycles; give the dev server more headroom than production needs.
    env: { ...process.env, JOB_SOCKET_PATH: socketPath, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
  webChild.on('error', (error) => {
    console.error('[dev] Failed to start web:', error);
  });
  webChild.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] web dev server exited unexpectedly (code ${code}); stopping jobs.`);
      void shutdown(undefined, code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error('[dev] Fatal error:', error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
});
