import { describe, test, expect } from 'vitest';
import { computeBackoffMs } from './backoff';

describe('computeBackoffMs', () => {
  test('never spins (always returns a non-negative delay)', () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const delay = computeBackoffMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  test('is bounded by the exponential value under full jitter (deterministic random)', () => {
    const baseMs = 100;
    const capMs = 10_000;

    // random() = 1 -> delay should equal the exponential ceiling for that attempt.
    const delayAttempt1 = computeBackoffMs(1, { baseMs, capMs, random: () => 1 });
    expect(delayAttempt1).toBe(baseMs);

    const delayAttempt3 = computeBackoffMs(3, { baseMs, capMs, random: () => 1 });
    expect(delayAttempt3).toBe(baseMs * 4);
  });

  test('caps the exponential growth at capMs', () => {
    const delay = computeBackoffMs(20, { baseMs: 500, capMs: 5000, random: () => 1 });
    expect(delay).toBe(5000);
  });

  test('random()=0 always yields a zero delay', () => {
    const delay = computeBackoffMs(5, { random: () => 0 });
    expect(delay).toBe(0);
  });

  test('delay is deterministic for a fixed random function', () => {
    const random = () => 0.5;
    const first = computeBackoffMs(2, { random });
    const second = computeBackoffMs(2, { random });
    expect(first).toBe(second);
  });
});
