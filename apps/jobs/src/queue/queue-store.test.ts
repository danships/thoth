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
});
