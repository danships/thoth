import { describe, test, expect, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { pingJobService, enqueueJob } from '@thoth/job-protocol';

/**
 * Process integration test (THOTH-059): starts the real `@thoth/jobs` entry point as a child
 * process (via `tsx`, so no build step is required to run this suite), pings it, enqueues the
 * test-only no-op job over the real socket, and asserts it runs exactly once and logs a
 * terminal result. Also starts a second instance to confirm restart never recovers prior
 * in-memory work (a fresh process has an empty queue).
 */
describe('jobs process integration', () => {
  let dir: string;
  let child: ChildProcessWithoutNullStreams | undefined;
  let stdout = '';

  afterEach(async () => {
    if (child && !child.killed) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child?.once('exit', resolve));
    }
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function startProcess(socketPath: string): Promise<void> {
    stdout = '';
    child = spawn(nodePath.join(__dirname, '..', 'node_modules', '.bin', 'tsx'), [nodePath.join(__dirname, '..', 'src', 'index.ts')], {
      cwd: nodePath.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        JOB_SOCKET_PATH: socketPath,
        DB: `sqlite://${nodePath.join(nodePath.dirname(socketPath), 'jobs-test.db')}`,
        LOG_LEVEL: 'info',
      },
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    await waitUntil(() => stdout.includes('job.service.ready'), 10_000);
  }

  async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`waitUntil timed out. Output so far:\n${stdout}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  test('pings the service, enqueues a test job, and observes it run exactly once with a terminal log', async () => {
    dir = await mkdtemp(nodePath.join(tmpdir(), 'thoth-jobs-integration-'));
    const socketPath = nodePath.join(dir, 'jobs.sock');
    await startProcess(socketPath);

    const pingResponse = await pingJobService({ socketPath });
    expect(pingResponse.ok).toBe(true);

    const enqueueResponse = await enqueueJob(
      { type: 'test.noop', payloadVersion: 1, payload: { note: 'integration' } },
      { socketPath }
    );
    expect(enqueueResponse.ok).toBe(true);

    await waitUntil(() => stdout.includes('job.terminal') && stdout.includes('"status":"completed"'), 10_000);

    const terminalLogLines = stdout.split('\n').filter((line) => line.includes('job.terminal'));
    expect(terminalLogLines).toHaveLength(1);
  }, 20_000);

  test('restarting the process does not recover prior in-memory work', async () => {
    dir = await mkdtemp(nodePath.join(tmpdir(), 'thoth-jobs-integration-restart-'));
    const socketPath = nodePath.join(dir, 'jobs.sock');
    await startProcess(socketPath);

    await enqueueJob({ type: 'test.noop', payloadVersion: 1, payload: {} }, { socketPath });
    await waitUntil(() => stdout.includes('job.terminal'), 10_000);

    child?.kill('SIGTERM');
    await new Promise((resolve) => child?.once('exit', resolve));

    await startProcess(socketPath);
    // A freshly started process has no memory of the prior job; only the readiness log exists,
    // never a leftover terminal log from before restart.
    expect(stdout.includes('job.terminal')).toBe(false);
  }, 30_000);
});
