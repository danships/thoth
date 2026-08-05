import { describe, test, expect } from 'vitest';
import { buildPageUrlId, createTitleSlug, extractPageId } from './page-url';

// A real `short-uuid`-shaped id: 22 alphanumeric characters, no dashes (see comment in
// `page-url.ts` for why this exact shape is what makes a slug prefix round-trippable).
const GENERATED_ID = 'hBg8z5Mhyv3dYBkXLSMLMH';

describe('createTitleSlug', () => {
  test('lowercases and hyphenates a name', () => {
    expect(createTitleSlug('My Awesome Page')).toBe('my-awesome-page');
  });

  test('strips accents and non-alphanumeric characters', () => {
    expect(createTitleSlug('Café — Notes! #1')).toBe('cafe-notes-1');
  });

  test('truncates to 30 characters without a trailing dash', () => {
    const long = createTitleSlug('This is a very long page title that exceeds the limit');
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith('-')).toBe(false);
  });

  test('returns an empty string for missing or unusable names', () => {
    expect(createTitleSlug(undefined)).toBe('');
    expect(createTitleSlug(null)).toBe('');
    expect(createTitleSlug('')).toBe('');
    expect(createTitleSlug('🎉🎉🎉')).toBe('');
  });
});

describe('buildPageUrlId', () => {
  test('prefixes a generated-shape id with the title slug', () => {
    expect(buildPageUrlId(GENERATED_ID, 'My Awesome Page')).toBe(`my-awesome-page-${GENERATED_ID}`);
  });

  test('falls back to the bare id when no usable name is given', () => {
    expect(buildPageUrlId(GENERATED_ID, undefined)).toBe(GENERATED_ID);
    expect(buildPageUrlId(GENERATED_ID, null)).toBe(GENERATED_ID);
    expect(buildPageUrlId(GENERATED_ID, '🎉')).toBe(GENERATED_ID);
  });

  test('falls back to the bare id when the id is not generated-id shaped (e.g. seeded/custom ids)', () => {
    const customId = 'e2e-page-root-0000-0000-0000-000000000001';
    expect(buildPageUrlId(customId, 'Root Page')).toBe(customId);
  });
});

describe('extractPageId', () => {
  test('round-trips a slug-prefixed generated id back to the bare id', () => {
    const combined = buildPageUrlId(GENERATED_ID, 'My Awesome Page');
    expect(extractPageId(combined)).toBe(GENERATED_ID);
  });

  test('returns a bare generated id unchanged', () => {
    expect(extractPageId(GENERATED_ID)).toBe(GENERATED_ID);
  });

  test('returns a dash-containing custom/seeded id unchanged', () => {
    const customId = 'e2e-page-root-0000-0000-0000-000000000001';
    expect(extractPageId(customId)).toBe(customId);
  });

  test('handles a slug with multiple hyphenated words', () => {
    const combined = buildPageUrlId(GENERATED_ID, 'Quarterly Planning Notes 2026');
    expect(combined.startsWith('quarterly-planning-notes-2026-')).toBe(true);
    expect(extractPageId(combined)).toBe(GENERATED_ID);
  });
});
