import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { JobClientError, enqueueJob, pingJobService } from './client';
import { JobRequestEnvelopeSchema } from './envelope';

describe('job-protocol client', () => {
  let dir: string;
  let socketPath: string;
  let server: Server;

  beforeAll(async () => {
    dir = await mkdtemp(nodePath.join(tmpdir(), 'thoth-job-protocol-client-test-'));
    socketPath = nodePath.join(dir, 'jobs.sock');

    server = createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }
        const line = buffer.slice(0, newlineIndex);
        const parsed = JobRequestEnvelopeSchema.safeParse(JSON.parse(line));
        if (!parsed.success) {
          socket.end(JSON.stringify({ version: 1, requestId: 'bad', ok: false, error: { code: 'INVALID_REQUEST', message: 'bad', retryable: false } }) + '\n');
          return;
        }
        const request = parsed.data;
        if (request.kind === 'ping') {
          socket.end(JSON.stringify({ version: 1, requestId: request.requestId, ok: true, result: {} }) + '\n');
          return;
        }
        socket.end(
          JSON.stringify({
            version: 1,
            requestId: request.requestId,
            ok: true,
            result: { jobId: 'job-123', disposition: 'created' },
          }) + '\n'
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  test('ping succeeds and correlates requestId', async () => {
    const response = await pingJobService({ socketPath });
    expect(response.ok).toBe(true);
  });

  test('enqueue succeeds and returns jobId/disposition', async () => {
    const response = await enqueueJob(
      { type: 'test.noop', payloadVersion: 1, payload: {} },
      { socketPath }
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.jobId).toBe('job-123');
      expect(response.result.disposition).toBe('created');
    }
  });

  test('rejects with CONNECT_FAILED for a non-existent socket', async () => {
    await expect(pingJobService({ socketPath: nodePath.join(dir, 'does-not-exist.sock') })).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
  });

  test('aborts via AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(pingJobService({ socketPath, signal: controller.signal })).rejects.toBeInstanceOf(JobClientError);
  });

  test('times out when connecting to a non-listening path quickly', async () => {
    await expect(
      pingJobService({ socketPath: nodePath.join(dir, 'nope.sock'), connectTimeoutMs: 100 })
    ).rejects.toMatchObject({ retryable: true });
  });
});
