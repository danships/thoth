import { describe, test, expect, vi } from 'vitest';
import type { Logger } from 'winston';
import { z } from 'zod';
import { RetryableJobError } from '@thoth/job-protocol';
import { QueueService } from '../queue/queue-service';
import { JobRegistry } from '../handlers/registry';
import { Runner } from './runner';

function fakeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Runner', () => {
  test('runs a queued job exactly once and marks it completed', async () => {
    const queueService = new QueueService();
    const registry = new JobRegistry();
    const handler = vi.fn().mockResolvedValue({ ok: true });
    registry.register<{}>({
      type: 'unit.success',
      payloadVersion: 1,
      payloadSchema: z.object({}).strict(),
      priority: 0,
      maxAttempts: 1,
      handler,
    });

    const logger = fakeLogger();
    const runner = new Runner(queueService, registry, { logger, pollIntervalMs: 20 });
    const { record } = await queueService.enqueue({
      type: 'unit.success',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });

    runner.start();
    await waitUntil(() => queueService.get(record.id)?.status === 'completed');
    await runner.stop(100);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(queueService.get(record.id)?.status).toBe('completed');
    expect(logger.info).toHaveBeenCalledWith(
      'job.terminal',
      expect.objectContaining({ jobId: record.id, type: 'unit.success', status: 'completed' })
    );
  });

  test('marks an unknown job type dead without invoking a fallback handler', async () => {
    const queueService = new QueueService();
    const registry = new JobRegistry();
    const logger = fakeLogger();
    const runner = new Runner(queueService, registry, { logger, pollIntervalMs: 20 });

    const { record } = await queueService.enqueue({
      type: 'unit.unregistered',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });

    runner.start();
    await waitUntil(() => queueService.get(record.id)?.status === 'dead');
    await runner.stop(100);

    expect(queueService.get(record.id)?.status).toBe('dead');
  });

  test('marks a job with invalid stored payload dead', async () => {
    const queueService = new QueueService();
    const registry = new JobRegistry();
    const handler = vi.fn();
    registry.register<{ mustBeString: string }>({
      type: 'unit.invalid-payload',
      payloadVersion: 1,
      payloadSchema: z.object({ mustBeString: z.string() }).strict(),
      priority: 0,
      maxAttempts: 1,
      handler,
    });
    const logger = fakeLogger();
    const runner = new Runner(queueService, registry, { logger, pollIntervalMs: 20 });

    const { record } = await queueService.enqueue({
      type: 'unit.invalid-payload',
      payloadVersion: 1,
      payload: { mustBeString: 123 },
      priority: 0,
      maxAttempts: 1,
    });

    runner.start();
    await waitUntil(() => queueService.get(record.id)?.status === 'dead');
    await runner.stop(100);

    expect(handler).not.toHaveBeenCalled();
    expect(queueService.get(record.id)?.status).toBe('dead');
  });

  test('requeues a RetryableJobError with backoff, then marks dead once attempts are exhausted', async () => {
    const queueService = new QueueService();
    const registry = new JobRegistry();
    const handler = vi.fn().mockRejectedValue(new RetryableJobError('try again'));
    registry.register<{}>({
      type: 'unit.retryable',
      payloadVersion: 1,
      payloadSchema: z.object({}).strict(),
      priority: 0,
      maxAttempts: 2,
      handler,
    });
    const logger = fakeLogger();
    const runner = new Runner(queueService, registry, { logger, pollIntervalMs: 10, random: () => 0 });

    const { record } = await queueService.enqueue({
      type: 'unit.retryable',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 2,
    });

    runner.start();
    await waitUntil(() => queueService.get(record.id)?.status === 'dead', 3000);
    await runner.stop(100);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(queueService.get(record.id)?.status).toBe('dead');
  });

  test('completes successfully when the handler resolves undefined', async () => {
    const queueService = new QueueService();
    const registry = new JobRegistry();
    const handler = vi.fn().mockResolvedValue(undefined);
    registry.register<{}>({
      type: 'unit.undefined-result',
      payloadVersion: 1,
      payloadSchema: z.object({}).strict(),
      priority: 0,
      maxAttempts: 1,
      handler,
    });

    const logger = fakeLogger();
    const runner = new Runner(queueService, registry, { logger, pollIntervalMs: 20 });
    const { record } = await queueService.enqueue({
      type: 'unit.undefined-result',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });

    runner.start();
    await waitUntil(() => queueService.get(record.id)?.status !== 'queued' && queueService.get(record.id)?.status !== 'running');
    await runner.stop(100);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(queueService.get(record.id)?.status).toBe('completed');
  });

  test('bounds handler concurrency', async () => {
    const queueService = new QueueService();
    const registry = new JobRegistry();
    let concurrent = 0;
    let maxConcurrent = 0;
    const handler = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrent -= 1;
      return {};
    });
    registry.register<{}>({
      type: 'unit.concurrent',
      payloadVersion: 1,
      payloadSchema: z.object({}).strict(),
      priority: 0,
      maxAttempts: 1,
      handler,
    });
    const logger = fakeLogger();
    const runner = new Runner(queueService, registry, { logger, pollIntervalMs: 10, concurrency: 2 });

    const ids: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const { record } = await queueService.enqueue({
        type: 'unit.concurrent',
        payloadVersion: 1,
        payload: {},
        priority: 0,
        maxAttempts: 1,
      });
      ids.push(record.id);
    }

    runner.start();
    await waitUntil(() => ids.every((id) => queueService.get(id)?.status === 'completed'), 3000);
    await runner.stop(100);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(handler).toHaveBeenCalledTimes(6);
  });
});
