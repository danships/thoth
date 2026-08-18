// Pure column-label resolution logic factored out of `values-diff-view.tsx` (a `'use client'`
// component with JSX) so it can be unit-tested as plain `.ts` — this repo's Vitest unit config
// only covers `src/**/*.test.ts` and has no jsdom/@testing-library/react setup for `.tsx`.
export type ColumnLabel = { text: string; deleted: boolean };

// Resolves a column id to its current display name. A column absent from `nameById` has since
// been deleted from the Data Source — shown as the raw id with a visible "(deleted)" remark
// rather than silently displaying a bare id that looks like a real name.
export function columnLabel(columnId: string, nameById: Map<string, string>): ColumnLabel {
  const name = nameById.get(columnId);
  return name ? { text: name, deleted: false } : { text: columnId, deleted: true };
}
