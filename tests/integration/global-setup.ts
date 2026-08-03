// tests/integration/global-setup.ts
//
// Vitest global-setup for the API integration suite.
// Spawns a Next.js dev server backed by a fresh, seeded SQLite database.
import type { TestProject } from 'vitest/node';
import { spawn, execSync, type ChildProcessByStdio } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import type { Readable } from 'node:stream';

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

export default async function globalSetup({ provide }: Pick<TestProject, 'provide'>) {
  const projectRoot = path.resolve(import.meta.dirname, '../..');

  // Create a task-scoped temporary directory for the database and uploads
  const temporaryDirectory = await mkdtemp(path.join(projectRoot, '.thoth-integration-'));
  const databasePath = path.join(temporaryDirectory, 'integration.db');
  const uploadsPath = path.join(temporaryDirectory, 'uploads');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DB: `sqlite://${databasePath}`,
    BETTER_AUTH_SECRET: 'integration-test-secret-not-for-production',
    SUPERSAVE_SKIP_SYNC: 'false',
    LOG_LEVEL: 'error',
    STORAGE_LOCAL_FOLDER: uploadsPath,
    NEXT_TELEMETRY_DISABLED: '1',
  };

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

  serverProcess.stdout.on('data', (data: Buffer) => {
    serverOutput.push(data.toString());
  });
  serverProcess.stderr.on('data', (data: Buffer) => {
    serverOutput.push(data.toString());
  });

  // Detect early exit
  let serverExited = false;
  let exitCode: number | null = null;
  serverProcess.on('exit', (code: number | null) => {
    serverExited = true;
    exitCode = code;
  });

  // Kills the server and removes the temporary directory; used to avoid leaking a process
  // holding the port/database file if setup fails partway through.
  const cleanupOnFailure = async () => {
    serverProcess.kill('SIGKILL');
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  };

  // Wait for the server to be ready (poll the auth config endpoint)
  try {
    await waitForServer(`${baseUrl}/api/auth/ok`, 90_000, serverOutput);
  } catch (error) {
    await cleanupOnFailure();
    if (serverExited) {
      throw new Error(
        `Server exited with code ${exitCode} before becoming ready.\n` +
          `Output:\n${serverOutput.join('')}`
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
    await cleanupOnFailure();
    throw error;
  }

  // Provide the base URL to test files via the globalSetup provide mechanism
  // Tests read this via `process.env.INTEGRATION_BASE_URL`
  provide('baseUrl', baseUrl);
  provide('tempDir', temporaryDirectory);

  // Write env so workers pick it up
  process.env['INTEGRATION_BASE_URL'] = baseUrl;

  return async () => {
    // Teardown: kill the server and clean up
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
