// tests/integration/global-setup.ts
//
// Vitest global-setup for the API integration suite (THOTH-060). Runs the migration CLI once,
// starts `@thoth/jobs` against a temp-directory-scoped Unix socket, waits for a validated ping,
// then starts the Next.js dev server (with the same `JOB_SOCKET_PATH`) and seeds it — mirroring
// production's migration-then-PM2(jobs+web) bootstrap ordering, minus PM2 itself.
import type { TestProject } from 'vitest/node';
import { spawn, execSync, type ChildProcessByStdio } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import type { Readable } from 'node:stream';
import { pingJobService } from '@thoth/job-protocol';

/** Find a free port on the loopback interface. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Could not determine port'));
      }
    });
  });
}

/** Poll an HTTP endpoint until it responds 200, or give up after `timeoutMs`. */
async function waitForServer(url: string, timeoutMs: number, serverOutput: string[]): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Server at ${url} did not become ready within ${timeoutMs}ms.\n` +
      `Last server output:\n${serverOutput.slice(-40).join('')}`
  );
}

/** Poll the jobs Unix socket with a real protocol `ping` until it responds, or give up. */
async function waitForJobsReady(socketPath: string, timeoutMs: number, jobsOutput: string[]): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await pingJobService({ socketPath, connectTimeoutMs: 1000, responseTimeoutMs: 1000 });
      if (response.ok) return;
    } catch {
      // Not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Jobs service at ${socketPath} did not become ready within ${timeoutMs}ms.\n` +
      `Last jobs output:\n${jobsOutput.slice(-40).join('')}`
  );
}

/** Pipes a child process's stdout/stderr into a bounded in-memory buffer for failure diagnostics. */
function captureOutput(child: ChildProcessByStdio<null, Readable, Readable>, sink: string[], maxLines = 200): void {
  const push = (data: Buffer) => {
    sink.push(data.toString());
    if (sink.length > maxLines) {
      sink.splice(0, sink.length - maxLines);
    }
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
}

export default async function globalSetup({ provide }: Pick<TestProject, 'provide'>) {
  const projectRoot = path.resolve(import.meta.dirname, '../..');
  const monorepoRoot = path.resolve(projectRoot, '../..');

  // Create a task-scoped temporary directory for the database, uploads, and the jobs socket —
  // a single directory so a single `rm` cleans up everything this run created.
  const temporaryDirectory = await mkdtemp(path.join(projectRoot, '.thoth-integration-'));
  const databasePath = path.join(temporaryDirectory, 'integration.db');
  const uploadsPath = path.join(temporaryDirectory, 'uploads');
  const socketPath = path.join(temporaryDirectory, 'jobs.sock');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DB: `sqlite://${databasePath}`,
    BETTER_AUTH_SECRET: 'integration-test-secret-not-for-production',
    LOG_LEVEL: 'error',
    STORAGE_LOCAL_FOLDER: uploadsPath,
    NEXT_TELEMETRY_DISABLED: '1',
    JOB_SOCKET_PATH: socketPath,
    // Shrinks the otherwise-real webhook delivery network timeout/backoff (THOTH-061) so tests
    // against an intentionally unreachable webhook URL (192.0.2.1) reach a terminal delivery
    // status in seconds rather than minutes, without touching production defaults.
    WEBHOOK_DELIVERY_TIMEOUT_MS: '300',
    WEBHOOK_DELIVERY_BACKOFF_BASE_MS: '50',
  };

  // Create the schema (fresh SQLite file) via the standalone migration CLI before either
  // long-running process starts — mirrors production's `db:migrate`-before-PM2(jobs+web)
  // bootstrap. This is the only process in this suite that runs with schema sync enabled; both
  // the web dev server and the jobs process below always open the database (jobs: none at all)
  // with sync disabled.
  execSync(`pnpm --filter @thoth/database db:migrate`, {
    cwd: monorepoRoot,
    env: environment,
    stdio: 'pipe',
    timeout: 60_000,
  });

  const jobsOutput: string[] = [];
  const jobsTsxBin = path.join(monorepoRoot, 'apps', 'jobs', 'node_modules', '.bin', 'tsx');
  // Spawn `tsx` directly (rather than `pnpm --filter @thoth/jobs dev`) so `SIGTERM`/`SIGKILL`
  // sent to this child reaches the actual jobs process without depending on an intermediate
  // pnpm wrapper to forward it — pnpm does not reliably propagate signals to its own child on
  // all platforms, which previously left an orphaned jobs process after teardown.
  const jobsProcess = spawn(jobsTsxBin, ['watch', 'src/index.ts'], {
    cwd: path.join(monorepoRoot, 'apps', 'jobs'),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessByStdio<null, Readable, Readable>;
  captureOutput(jobsProcess, jobsOutput);

  let jobsExited = false;
  let jobsExitCode: number | null = null;
  jobsProcess.on('exit', (code: number | null) => {
    jobsExited = true;
    jobsExitCode = code;
  });

  const killJobsProcess = async (): Promise<void> => {
    jobsProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        jobsProcess.kill('SIGKILL');
        resolve();
      }, 5000);
      jobsProcess.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  };

  const cleanupOnFailure = async () => {
    await killJobsProcess().catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  };

  try {
    await waitForJobsReady(socketPath, 30_000, jobsOutput);
  } catch (error) {
    await cleanupOnFailure();
    if (jobsExited) {
      throw new Error(
        `Jobs process exited with code ${jobsExitCode} before becoming ready.\n` + `Output:\n${jobsOutput.join('')}`
      );
    }
    throw error;
  }

  const serverOutput: string[] = [];

  // Spawn the Next.js dev server
  const serverProcess = spawn(
    'pnpm',
    ['exec', 'next', 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: projectRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ) as ChildProcessByStdio<null, Readable, Readable>;

  captureOutput(serverProcess, serverOutput);

  // Detect early exit
  let serverExited = false;
  let exitCode: number | null = null;
  serverProcess.on('exit', (code: number | null) => {
    serverExited = true;
    exitCode = code;
  });

  // Kills both children and removes the temporary directory; used to avoid leaking a process
  // holding the port/database file/socket if setup fails partway through.
  const cleanupBothOnFailure = async () => {
    serverProcess.kill('SIGKILL');
    await killJobsProcess().catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  };

  // Wait for the server to be ready (poll the auth config endpoint)
  try {
    await waitForServer(`${baseUrl}/api/auth/ok`, 90_000, serverOutput);
  } catch (error) {
    await cleanupBothOnFailure();
    if (serverExited) {
      throw new Error(
        `Server exited with code ${exitCode} before becoming ready.\n` + `Output:\n${serverOutput.join('')}`
      );
    }
    throw error;
  }

  // Run the seed script against the integration database
  try {
    execSync(`pnpm tsx scripts/end-to-end-seed.ts`, {
      cwd: projectRoot,
      env: environment,
      stdio: 'pipe',
      timeout: 60_000,
    });
  } catch (error) {
    await cleanupBothOnFailure();
    throw error;
  }

  // Provide the base URL to test files via the globalSetup provide mechanism
  // Tests read this via `process.env.INTEGRATION_BASE_URL`
  provide('baseUrl', baseUrl);
  provide('tempDir', temporaryDirectory);

  // Write env so workers pick it up
  process.env['INTEGRATION_BASE_URL'] = baseUrl;

  return async () => {
    // Teardown: kill both children (web then jobs) and clean up
    try {
      serverProcess.kill('SIGTERM');
      // Give it a moment to shut down gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve();
        }, 5000);
        serverProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch {
      // Process may already be dead
    }

    await killJobsProcess().catch(() => undefined);

    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
    tempDir: string;
  }
}
