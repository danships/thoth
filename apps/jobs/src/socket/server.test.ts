import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import type { Logger } from 'winston';
import { z } from 'zod';
import { JobSocketServer } from './server.js';
import { QueueService } from '../queue/queue-service.js';
import { JobRegistry } from '../handlers/registry.js';

function fakeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

async function sendRaw(socketPath: string, data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath });
    let buffer = '';
    socket.on('connect', () => socket.write(data));
    socket.on('data', (chunk) => (buffer += chunk.toString('utf8')));
    socket.on('close', () => resolve(buffer));
    socket.on('error', reject);
  });
}

function buildServer(socketPath: string) {
  const queueService = new QueueService();
  const registry = new JobRegistry();
  registry.register<{}>({
    type: 'test.noop',
    payloadVersion: 1,
    payloadSchema: z.object({}).strict(),
    priority: 0,
    maxAttempts: 1,
    handler: async () => ({}),
  });
  const server = new JobSocketServer({ socketPath, queueService, registry, logger: fakeLogger() });
  return { server, queueService, registry };
}

describe('JobSocketServer', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-jobs-socket-test-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('binds with a private parent directory (0700) and socket mode (0600)', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'nested', 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const parentStat = await import('node:fs/promises').then((fs) => fs.stat(nodePath.dirname(socketPath)));
    const socketStat = await import('node:fs/promises').then((fs) => fs.lstat(socketPath));

    expect(parentStat.mode & 0o777).toBe(0o700);
    expect(socketStat.mode & 0o777).toBe(0o600);

    await server.stop();
  });

  test('responds to ping', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const response = await sendRaw(
      socketPath,
      JSON.stringify({ version: 1, requestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', kind: 'ping' }) + '\n'
    );
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(true);

    await server.stop();
  });

  test('enqueues a job and returns jobId/disposition', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const response = await sendRaw(
      socketPath,
      JSON.stringify({
        version: 1,
        requestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        kind: 'enqueue',
        job: { type: 'test.noop', payloadVersion: 1, payload: {} },
      }) + '\n'
    );
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.result.disposition).toBe('created');
    expect(typeof parsed.result.jobId).toBe('string');

    await server.stop();
  });

  test('reports status for a known job and found:false for an unknown one', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const enqueueResponse = await sendRaw(
      socketPath,
      JSON.stringify({
        version: 1,
        requestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        kind: 'enqueue',
        job: { type: 'test.noop', payloadVersion: 1, payload: {} },
      }) + '\n'
    );
    const jobId = JSON.parse(enqueueResponse.trim()).result.jobId as string;

    const statusResponse = await sendRaw(
      socketPath,
      JSON.stringify({
        version: 1,
        requestId: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
        kind: 'status',
        jobId,
      }) + '\n'
    );
    const parsedStatus = JSON.parse(statusResponse.trim());
    expect(parsedStatus.ok).toBe(true);
    expect(parsedStatus.result.found).toBe(true);
    expect(['queued', 'running', 'completed', 'dead']).toContain(parsedStatus.result.status);

    const unknownResponse = await sendRaw(
      socketPath,
      JSON.stringify({
        version: 1,
        requestId: 'cccccccc-1111-4111-8111-cccccccccccc',
        kind: 'status',
        jobId: 'does-not-exist',
      }) + '\n'
    );
    const parsedUnknown = JSON.parse(unknownResponse.trim());
    expect(parsedUnknown.ok).toBe(true);
    expect(parsedUnknown.result.found).toBe(false);

    await server.stop();
  });

  test('rejects malformed JSON', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const response = await sendRaw(socketPath, 'not json\n');
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('INVALID_REQUEST');

    await server.stop();
  });

  test('rejects an unsupported version', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const response = await sendRaw(
      socketPath,
      JSON.stringify({ version: 2, requestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', kind: 'ping' }) + '\n'
    );
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('UNSUPPORTED_VERSION');

    await server.stop();
  });

  test('rejects multiple frames on one connection', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const envelope = JSON.stringify({ version: 1, requestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', kind: 'ping' });
    const response = await sendRaw(socketPath, `${envelope}\n${envelope}\n`);
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('INVALID_REQUEST');

    await server.stop();
  });

  test('rejects an oversized frame', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    const oversized = 'a'.repeat(300 * 1024);
    const response = await sendRaw(socketPath, oversized);
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('FRAME_TOO_LARGE');

    await server.stop();
  });

  test('refuses to bind to a path that is a directory', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    await mkdir(socketPath);
    const { server } = buildServer(socketPath);
    await expect(server.start()).rejects.toThrow(/directory/);
  });

  test('refuses to bind to a path that is a regular file', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    await writeFile(socketPath, 'not a socket');
    const { server } = buildServer(socketPath);
    await expect(server.start()).rejects.toThrow(/regular file/);
  });

  test('refuses to bind to a path that is a symlink', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const targetPath = nodePath.join(temporaryDirectory, 'target-file');
    await writeFile(targetPath, 'x');
    await symlink(targetPath, socketPath);
    const { server } = buildServer(socketPath);
    await expect(server.start()).rejects.toThrow(/symlink/);
  });

  test('refuses to start a second process when the socket is already live', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server: first } = buildServer(socketPath);
    await first.start();

    const { server: second } = buildServer(socketPath);
    await expect(second.start()).rejects.toThrow(/already accepting connections/);

    await first.stop();
  });

  test('recovers a stale (same-owner, refused) socket file and rebinds', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');

    // Create a stale socket file: bind a raw net server then close it WITHOUT unlinking,
    // leaving a socket-type file that refuses connections.
    const staleServer = createServer(() => {});
    await new Promise<void>((resolve) => staleServer.listen(socketPath, resolve));
    await new Promise<void>((resolve) => staleServer.close(() => resolve()));

    const { server } = buildServer(socketPath);
    await server.start();
    await server.stop();
  });

  test('removes the owned socket file on orderly shutdown', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();
    await server.stop();

    await expect(import('node:fs/promises').then((fs) => fs.lstat(socketPath))).rejects.toThrow();
  });

  test('rejects new requests while shutting down', async () => {
    const socketPath = nodePath.join(temporaryDirectory, 'jobs.sock');
    const { server } = buildServer(socketPath);
    await server.start();

    // Force shuttingDown without fully stopping the listener, to test in-flight rejection logic.
    (server as unknown as { shuttingDown: boolean }).shuttingDown = true;

    const response = await sendRaw(
      socketPath,
      JSON.stringify({ version: 1, requestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', kind: 'ping' }) + '\n'
    );
    const parsed = JSON.parse(response.trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('SHUTTING_DOWN');

    (server as unknown as { shuttingDown: boolean }).shuttingDown = false;
    await server.stop();
  });
});
