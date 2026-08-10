import { describe, test, expect } from 'vitest';
import { createPageBodySchema } from './create-page';
import { updatePageBodySchema } from './update-page';

describe('createPageBodySchema emoji (THOTH-069)', () => {
  test('accepts a body that omits emoji entirely', () => {
    const result = createPageBodySchema.safeParse({ name: 'My Page', parentId: null });
    expect(result.success).toBe(true);
  });

  test('accepts an explicit null emoji', () => {
    const result = createPageBodySchema.safeParse({ name: 'My Page', emoji: null, parentId: null });
    expect(result.success).toBe(true);
  });

  test('accepts a valid non-empty emoji', () => {
    const result = createPageBodySchema.safeParse({ name: 'My Page', emoji: '📄', parentId: null });
    expect(result.success).toBe(true);
  });

  test('still rejects an empty-string emoji', () => {
    const result = createPageBodySchema.safeParse({ name: 'My Page', emoji: '', parentId: null });
    expect(result.success).toBe(false);
  });
});

describe('updatePageBodySchema emoji (THOTH-069 regression)', () => {
  test('accepts an empty body (all fields optional)', () => {
    const result = updatePageBodySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('accepts a body that only sets name, omitting emoji', () => {
    const result = updatePageBodySchema.safeParse({ name: 'x' });
    expect(result.success).toBe(true);
  });
});
