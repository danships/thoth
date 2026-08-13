import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { COALESCE_WINDOW_MS } from './constants.js';
import { nextCoalesceWindowEnd, shouldCoalesce } from './coalesce.js';

describe('coalesce', () => {
  let now = new Date(0);

  beforeAll(() => {
    now = new Date('2024-01-01T12:00:00.000Z');
  });

  afterAll(() => {
    now = new Date(0);
  });

  test('returns true within the window for the same author', () => {
    const head = { author: 'user-1', coalesceWindowEnd: new Date(now.getTime() + 60_000).toISOString() };
    expect(shouldCoalesce(head, 'user-1', now)).toBe(true);
  });

  test('returns false for a different author', () => {
    const head = { author: 'user-1', coalesceWindowEnd: new Date(now.getTime() + 60_000).toISOString() };
    expect(shouldCoalesce(head, 'user-2', now)).toBe(false);
  });

  test('returns false after window expiry', () => {
    const head = { author: 'user-1', coalesceWindowEnd: new Date(now.getTime() - 1).toISOString() };
    expect(shouldCoalesce(head, 'user-1', now)).toBe(false);
  });

  test('returns false when there is no head', () => {
    expect(shouldCoalesce(null, 'user-1', now)).toBe(false);
  });

  test('extends the next coalesce window exactly COALESCE_WINDOW_MS from now', () => {
    const windowEnd = nextCoalesceWindowEnd(now);
    expect(new Date(windowEnd).getTime() - now.getTime()).toBe(COALESCE_WINDOW_MS);
  });
});
