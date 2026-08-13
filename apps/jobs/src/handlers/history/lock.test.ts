import { describe, test, expect } from 'vitest';
import { KeyedLock } from './lock.js';

describe('KeyedLock', () => {
  test('serialises calls sharing the same key', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];

    const first = lock.withLock('a', async () => {
      order.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('first-end');
    });
    const second = lock.withLock('a', async () => {
      order.push('second-start', 'second-end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  test('does not serialise calls with different keys', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];

    const a = lock.withLock('a', async () => {
      order.push('a-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('a-end');
    });
    const b = lock.withLock('b', async () => {
      order.push('b-start', 'b-end');
    });

    await Promise.all([a, b]);

    // `b` should run to completion while `a` is still sleeping.
    expect(order.indexOf('b-end')).toBeLessThan(order.indexOf('a-end'));
  });

  test('propagates errors and still releases the key for the next waiter', async () => {
    const lock = new KeyedLock();

    await expect(
      lock.withLock('a', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const result = await lock.withLock('a', async () => 'ok');
    expect(result).toBe('ok');
  });

  test('returns the handler result', async () => {
    const lock = new KeyedLock();
    const result = await lock.withLock('a', async () => 42);
    expect(result).toBe(42);
  });
});
