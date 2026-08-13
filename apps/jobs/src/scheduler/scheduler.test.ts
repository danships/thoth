import { describe, test, expect, vi } from 'vitest';
import type { Logger } from 'winston';
import { QueueService } from '../queue/queue-service.js';
import { Scheduler, type ScheduleDefinition } from './scheduler.js';

function fakeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

describe('Scheduler', () => {
  test('enqueues exactly one occurrence for the current bucket on first tick', async () => {
    const queueService = new QueueService();
    const now = new Date('2026-01-01T00:00:00.000Z');
    const schedules: ScheduleDefinition[] = [
      { type: 'sched.a', intervalMs: 60_000, priority: 0, maxAttempts: 1, payloadVersion: 1, payload: {} },
    ];
    const scheduler = new Scheduler(queueService, schedules, { logger: fakeLogger(), clock: () => now });

    await scheduler.tick();
    await scheduler.tick();

    const records = queueService.all().filter((record) => record.type === 'sched.a');
    expect(records).toHaveLength(1);
  });

  test('does not enqueue a new occurrence for the same bucket while one is still active', async () => {
    const queueService = new QueueService();
    const now = new Date('2026-01-01T00:00:00.000Z');
    const schedules: ScheduleDefinition[] = [
      { type: 'sched.b', intervalMs: 60_000, priority: 0, maxAttempts: 1, payloadVersion: 1, payload: {} },
    ];
    const scheduler = new Scheduler(queueService, schedules, { logger: fakeLogger(), clock: () => now });

    await scheduler.tick();
    // Simulate a restart: a fresh scheduler with no seen-bucket memory, same bucket, but the
    // prior job is still active (queued) — must not enqueue a duplicate.
    const scheduler2 = new Scheduler(queueService, schedules, { logger: fakeLogger(), clock: () => now });
    await scheduler2.tick();

    const records = queueService.all().filter((record) => record.type === 'sched.b');
    expect(records).toHaveLength(1);
  });

  test('enqueues a new occurrence once a new bucket begins', async () => {
    const queueService = new QueueService();
    let now = new Date('2026-01-01T00:00:00.000Z');
    const schedules: ScheduleDefinition[] = [
      { type: 'sched.c', intervalMs: 60_000, priority: 0, maxAttempts: 1, payloadVersion: 1, payload: {} },
    ];
    const scheduler = new Scheduler(queueService, schedules, { logger: fakeLogger(), clock: () => now });

    await scheduler.tick();
    const first = queueService.all().find((record) => record.type === 'sched.c');
    expect(first).toBeDefined();
    await queueService.claimNextDue(now);
    await queueService.complete(first!.id, 'done', now);

    now = new Date(now.getTime() + 60_000);
    await scheduler.tick();

    const records = queueService.all().filter((record) => record.type === 'sched.c');
    expect(records).toHaveLength(2);
  });

  test('restart resumes scheduling from the current bucket without replaying history', async () => {
    const queueService = new QueueService();
    const now = new Date('2026-01-01T00:10:00.000Z');
    const schedules: ScheduleDefinition[] = [
      { type: 'sched.d', intervalMs: 60_000, priority: 0, maxAttempts: 1, payloadVersion: 1, payload: {} },
    ];
    // A brand-new scheduler instance (as after a restart) with no seenBuckets memory should
    // only ever enqueue for the *current* bucket, never past ones.
    const scheduler = new Scheduler(queueService, schedules, { logger: fakeLogger(), clock: () => now });
    await scheduler.tick();

    const records = queueService.all().filter((record) => record.type === 'sched.d');
    expect(records).toHaveLength(1);
  });
});
