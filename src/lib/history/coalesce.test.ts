import assert from 'node:assert/strict';
import { COALESCE_WINDOW_MS } from './constants';
import { nextCoalesceWindowEnd, shouldCoalesce } from './coalesce';

const now = new Date('2024-01-01T12:00:00.000Z');

// True within window + same author
{
  const head = { author: 'user-1', coalesceWindowEnd: new Date(now.getTime() + 60_000).toISOString() };
  assert.equal(shouldCoalesce(head, 'user-1', now), true);
}

// False on different author
{
  const head = { author: 'user-1', coalesceWindowEnd: new Date(now.getTime() + 60_000).toISOString() };
  assert.equal(shouldCoalesce(head, 'user-2', now), false);
}

// False after window expiry
{
  const head = { author: 'user-1', coalesceWindowEnd: new Date(now.getTime() - 1).toISOString() };
  assert.equal(shouldCoalesce(head, 'user-1', now), false);
}

// False when no head
assert.equal(shouldCoalesce(null, 'user-1', now), false);

// nextCoalesceWindowEnd extends exactly COALESCE_WINDOW_MS from `now`
{
  const windowEnd = nextCoalesceWindowEnd(now);
  assert.equal(new Date(windowEnd).getTime() - now.getTime(), COALESCE_WINDOW_MS);
}

console.log('✅  coalesce tests passed');
