import { describe, test, expect } from 'vitest';
import { QueueStore } from './queue-store.js';

describe('QueueStore', () => {
  test('selectDue orders by priority desc, runAt asc, createdAt asc and excludes future jobs', () => {
    const store = new QueueStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const low = store.create({
      id: 'low',
      type: 'a',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      runAt: now,
      now,
    });
    const high = store.create({
      id: 'high',
      type: 'b',
      payloadVersion: 1,
      payload: {},
      priority: 5,
      maxAttempts: 1,
      runAt: now,
      now,
    });
    store.create({
      id: 'future',
      type: 'c',
      payloadVersion: 1,
      payload: {},
      priority: 10,
      maxAttempts: 1,
      runAt: new Date(now.getTime() + 60_000),
      now,
    });

    const due = store.selectDue(now);
    expect(due.map((record) => record.id)).toEqual([high.id, low.id]);
  });

  test('findActiveByDedupeKey only matches queued records', () => {
    const store = new QueueStore();
    const now = new Date();
    const record = store.create({
      id: 'a',
      type: 'x',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      dedupeKey: 'k1',
      runAt: now,
      now,
    });

    expect(store.findActiveByDedupeKey('k1')?.id).toBe(record.id);

    record.status = 'running';
    store.set(record);
    expect(store.findActiveByDedupeKey('k1')).toBeUndefined();
  });

  test('sweepRetention never drops queued/running records regardless of age', () => {
    const store = new QueueStore();
    const now = new Date();
    const record = store.create({
      id: 'a',
      type: 'x',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      runAt: new Date(now.getTime() - 10_000_000),
      now: new Date(now.getTime() - 10_000_000),
    });

    const evicted = store.sweepRetention(now, 1, 0);
    expect(evicted).toEqual([]);
    expect(store.get(record.id)).toBeDefined();
  });

  test('sweepRetention drops terminal records beyond the max count, keeping the most recent', () => {
    const store = new QueueStore();
    const now = new Date();

    const ids = ['old', 'mid', 'new'];
    for (const [index, id] of ids.entries()) {
      const record = store.create({
        id,
        type: 'x',
        payloadVersion: 1,
        payload: {},
        priority: 0,
        maxAttempts: 1,
        runAt: now,
        now,
      });
      record.status = 'completed';
      record.completedAt = new Date(now.getTime() + index * 1000);
      store.set(record);
    }

    const evicted = store.sweepRetention(new Date(now.getTime() + 10_000), 1_000_000, 2);
    expect(evicted).toEqual(['old']);
    expect(store.get('new')).toBeDefined();
    expect(store.get('mid')).toBeDefined();
    expect(store.get('old')).toBeUndefined();
  });

  test('pruneTerminalByPolicy applies distinct retention windows to completed vs dead records', () => {
    const store = new QueueStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const oldCompleted = store.create({
      id: 'old-completed',
      type: 'x',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      runAt: now,
      now,
    });
    oldCompleted.status = 'completed';
    oldCompleted.completedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    store.set(oldCompleted);

    const recentCompleted = store.create({
      id: 'recent-completed',
      type: 'x',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      runAt: now,
      now,
    });
    recentCompleted.status = 'completed';
    recentCompleted.completedAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    store.set(recentCompleted);

    const oldDead = store.create({
      id: 'old-dead',
      type: 'x',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      runAt: now,
      now,
    });
    oldDead.status = 'dead';
    oldDead.completedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    store.set(oldDead);

    const result = store.pruneTerminalByPolicy(now, {
      completedMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      deadMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
      limit: 100,
      offset: 0,
    });

    // `old-completed` is beyond the 7-day completed retention; `recent-completed` is not;
    // `old-dead` is only 8 days old, well within the 30-day dead retention.
    expect(result.ids).toEqual(['old-completed']);
    expect(result.totalEligible).toBe(1);
    expect(store.get('old-completed')).toBeUndefined();
    expect(store.get('recent-completed')).toBeDefined();
    expect(store.get('old-dead')).toBeDefined();
  });

  test('pruneTerminalByPolicy never touches queued/running records regardless of age', () => {
    const store = new QueueStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const queued = store.create({
      id: 'queued',
      type: 'x',
      payloadVersion: 1,
      payload: {},
      priority: 0,
      maxAttempts: 1,
      runAt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      now: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
    });

    const result = store.pruneTerminalByPolicy(now, {
      completedMaxAgeMs: 0,
      deadMaxAgeMs: 0,
      limit: 100,
      offset: 0,
    });

    expect(result.ids).toEqual([]);
    expect(store.get(queued.id)).toBeDefined();
  });

  test('pruneTerminalByPolicy bounds deletion by limit/offset and reports the full eligible count', () => {
    const store = new QueueStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    for (let index = 0; index < 5; index += 1) {
      const record = store.create({
        id: `dead-${index}`,
        type: 'x',
        payloadVersion: 1,
        payload: {},
        priority: 0,
        maxAttempts: 1,
        runAt: now,
        now,
      });
      record.status = 'dead';
      record.completedAt = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      store.set(record);
    }

    const result = store.pruneTerminalByPolicy(now, {
      completedMaxAgeMs: 0,
      deadMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
      limit: 2,
      offset: 0,
    });

    expect(result.ids).toHaveLength(2);
    expect(result.totalEligible).toBe(5);
    expect(store.all()).toHaveLength(3);
  });
});
