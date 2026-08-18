import { describe, expect, test } from 'vitest';
import { columnLabel } from './values-diff-view.helpers';

// `ValuesDiffView` itself is a client component rendered with Mantine (`.tsx`, JSX); the repo
// has no jsdom/@testing-library/react setup and Vitest's unit config only covers
// `src/**/*.test.ts`, so this covers the pure label-resolution logic that drives the "Column"
// cell — the actual bug fixed in THOTH-075. Rendering behaviour is covered by
// `tests/e2e/pages/page-history.spec.ts`.
describe('columnLabel', () => {
  test('resolves a known column id to its name', () => {
    const nameById = new Map([['col-1', 'Notes']]);
    expect(columnLabel('col-1', nameById)).toEqual({ text: 'Notes', deleted: false });
  });

  test('falls back to the raw id and marks it deleted when the column is absent', () => {
    const nameById = new Map([['col-1', 'Notes']]);
    expect(columnLabel('col-missing', nameById)).toEqual({ text: 'col-missing', deleted: true });
  });

  test('falls back to the raw id when there are no columns at all', () => {
    expect(columnLabel('col-1', new Map())).toEqual({ text: 'col-1', deleted: true });
  });
});
