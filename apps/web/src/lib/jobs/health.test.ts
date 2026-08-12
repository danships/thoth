import { describe, test, expect, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';

/**
 * Unit tests for the web-only jobs health adapter (THOTH-060). Uses a real Unix socket server
 * (not the full `@thoth/jobs` process) to exercise the client's success/failure paths without
 * a cross-package integration test. Each test dynamically re-imports `./health` after setting
 * `JOB_SOCKET_PATH` because the module reads the environment lazily on every call (no caching),
 * but `vi.resetModules()` keeps each test isolated regardless.
 */
describe('isJobsServiceReady', () => {
  let directory: string;
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
    delete process.env['JOB_SOCKET_PATH'];
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('returns false when JOB_SOCKET_PATH is not configured', async () => {
    delete process.env['JOB_SOCKET_PATH'];
    vi.resetModules();
    const { isJobsServiceReady: freshIsReady } = await import('./health');
    await expect(freshIsReady()).resolves.toBe(false);
  });

  test('returns true when the socket responds to a ping with ok', async () => {
    directory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-web-jobs-health-test-'));
    const socketPath = nodePath.join(directory, 'jobs.sock');

    server = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        const request = JSON.parse(chunk.toString('utf8').trim()) as { requestId: string };
        socket.end(JSON.stringify({ version: 1, requestId: request.requestId, ok: true, result: {} }) + '\n');
      });
    });
    await new Promise<void>((resolve) => server?.listen(socketPath, resolve));

    process.env['JOB_SOCKET_PATH'] = socketPath;
    vi.resetModules();
    const { isJobsServiceReady: freshIsReady } = await import('./health');
    await expect(freshIsReady()).resolves.toBe(true);
  });

  test('returns false when the socket refuses the connection', async () => {
    directory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-web-jobs-health-test-'));
    const socketPath = nodePath.join(directory, 'missing.sock');

    process.env['JOB_SOCKET_PATH'] = socketPath;
    vi.resetModules();
    const { isJobsServiceReady: freshIsReady } = await import('./health');
    await expect(freshIsReady()).resolves.toBe(false);
  });

  test('returns false when the socket responds with ok: false (e.g. shutting down)', async () => {
    directory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-web-jobs-health-test-'));
    const socketPath = nodePath.join(directory, 'jobs.sock');

    server = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        const request = JSON.parse(chunk.toString('utf8').trim()) as { requestId: string };
        socket.end(
          JSON.stringify({
            version: 1,
            requestId: request.requestId,
            ok: false,
            error: { code: 'SHUTTING_DOWN', message: 'shutting down', retryable: true },
          }) + '\n'
        );
      });
    });
    await new Promise<void>((resolve) => server?.listen(socketPath, resolve));

    process.env['JOB_SOCKET_PATH'] = socketPath;
    vi.resetModules();
    const { isJobsServiceReady: freshIsReady } = await import('./health');
    await expect(freshIsReady()).resolves.toBe(false);
  });
});
