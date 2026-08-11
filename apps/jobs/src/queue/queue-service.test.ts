import { describe, test, expect } from 'vitest';
import { QueueService } from './queue-service';

describe('QueueService', () => {
  test('creates a new record on first enqueue', async () => {
    const service = new QueueService();
    const result = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });
    expect(result.disposition).toBe('created');
    expect(result.record.status).toBe('queued');
  });

  test('coalesces a second enqueue sharing an active dedupe key', async () => {
    const service = new QueueService();
    const first = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: { note: 'first' },
      priority: 0,
      maxAttempts: 1,
      dedupeKey: 'key-1',
    });
    const second = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: { note: 'second' },
      priority: 0,
      maxAttempts: 1,
      dedupeKey: 'key-1',
    });

    expect(second.disposition).toBe('coalesced');
    expect(second.record.id).toBe(first.record.id);
    expect(service.all()).toHaveLength(1);
    expect((service.get(first.record.id)?.payload as { note: string }).note).toBe('second');
  });

  test('does not coalesce once the active record has left queued', async () => {
    const service = new QueueService();
    const first = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      dedupeKey: 'key-1',
    });
    await service.claimNextDue();
    await service.complete(first.record.id, 'ok');

    const second = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      dedupeKey: 'key-1',
    });

    expect(second.disposition).toBe('created');
    expect(second.record.id).not.toBe(first.record.id);
  });

  test('claimNextDue orders by priority desc, runAt asc, createdAt asc', async () => {
    const service = new QueueService();
    const now = new Date();
    const low = await service.enqueue(
      { type: 'a', payloadVersion: 1, payload: {}, priority: 0, maxAttempts: 1 },
      now
    );
    const high = await service.enqueue(
      { type: 'b', payloadVersion: 1, payload: {}, priority: 10, maxAttempts: 1 },
      now
    );

    const claimed = await service.claimNextDue(now);
    expect(claimed?.id).toBe(high.record.id);
    expect(low.record.status).toBe('queued');
  });

  test('does not claim future-runAt jobs', async () => {
    const service = new QueueService();
    const now = new Date();
    await service.enqueue(
      { type: 'a', payloadVersion: 1, payload: {}, priority: 0, maxAttempts: 1, runAt: new Date(now.getTime() + 60_000) },
      now
    );
    const claimed = await service.claimNextDue(now);
    expect(claimed).toBeUndefined();
  });

  test('legal transitions: queued -> running -> completed', async () => {
    const service = new QueueService();
    const { record } = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });

    const claimed = await service.claimNextDue();
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);

    const completed = await service.complete(record.id, 'done');
    expect(completed.status).toBe('completed');
    expect(completed.resultSummary).toBe('done');
  });

  test('legal transitions: queued -> running -> dead', async () => {
    const service = new QueueService();
    const { record } = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });
    await service.claimNextDue();
    const dead = await service.markDead(record.id, 'boom');
    expect(dead.status).toBe('dead');
    expect(dead.errorSummary).toBe('boom');
  });

  test('legal transitions: running -> queued (retry)', async () => {
    const service = new QueueService();
    const { record } = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 3,
    });
    await service.claimNextDue();
    const retried = await service.retry(record.id, new Date(Date.now() + 1000));
    expect(retried.status).toBe('queued');
  });

  test('rejects an illegal transition (completed -> running)', async () => {
    const service = new QueueService();
    const { record } = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });
    await service.claimNextDue();
    await service.complete(record.id, 'done');

    await expect(service.claimNextDue()).resolves.toBeUndefined();
  });

  test('rejects an illegal transition (queued -> completed directly)', async () => {
    const service = new QueueService();
    const { record } = await service.enqueue({
      type: 'test.noop',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });

    await expect(service.complete(record.id, 'done')).rejects.toThrow(/Illegal job status transition/);
  });

  test('serializes concurrent mutations (no lost updates)', async () => {
    const service = new QueueService();
    const enqueues = Array.from({ length: 20 }, (_, index) =>
      service.enqueue({
        type: 'test.noop',
        payloadVersion: 1,
        payload: { index },
        priority: 0,
        maxAttempts: 1,
      })
    );
    await Promise.all(enqueues);
    expect(service.all()).toHaveLength(20);
  });

  test('hasActiveOfType reflects queued/running but not terminal records', async () => {
    const service = new QueueService();
    expect(await service.hasActiveOfType('scheduled.thing')).toBe(false);

    const { record } = await service.enqueue({
      type: 'scheduled.thing',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
    });
    expect(await service.hasActiveOfType('scheduled.thing')).toBe(true);

    await service.claimNextDue();
    expect(await service.hasActiveOfType('scheduled.thing')).toBe(true);

    await service.complete(record.id, 'done');
    expect(await service.hasActiveOfType('scheduled.thing')).toBe(false);
  });

  test('sweepRetention evicts old terminal records but never active ones', async () => {
    const service = new QueueService();
    const now = new Date();

    const { record: terminalOld } = await service.enqueue(
      { type: 'a', payloadVersion: 1, payload: {}, priority: 0, maxAttempts: 1 },
      now
    );
    await service.claimNextDue(now);
    await service.complete(terminalOld.id, 'done', new Date(now.getTime() - 1_000_000));

    const { record: active } = await service.enqueue(
      { type: 'b', payloadVersion: 1, payload: {}, priority: 0, maxAttempts: 1 },
      now
    );

    const evicted = await service.sweepRetention(1000, 500, now);
    expect(evicted).toContain(terminalOld.id);
    expect(service.get(terminalOld.id)).toBeUndefined();
    expect(service.get(active.id)).toBeDefined();
  });
});
