import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { extractFileIdsFromContent, extractFileIdsFromValues } from './usage';
import type { Column, PageValue } from '@/types/schemas/entities/container';

describe('extractFileIdsFromContent', () => {
  beforeAll(() => undefined);
  afterAll(() => undefined);

  test('extracts a single reference', () => {
    expect(extractFileIdsFromContent('Here is a file: [download](/api/v1/files/abc-123/content)')).toEqual(['abc-123']);
  });

  test('preserves first-seen order across multiple distinct references', () => {
    expect(
      extractFileIdsFromContent(`![img](/api/v1/files/img-1/content)

[file](/api/v1/files/file-2/content)

[again](/api/v1/files/img-1/content)`)
    ).toEqual(['img-1', 'file-2']);
  });

  test('returns an empty list when there are no matches', () => {
    expect(extractFileIdsFromContent('Just plain text, no files here.')).toEqual([]);
  });

  test('ignores unrelated external URLs that embed a matching path shape', () => {
    expect(extractFileIdsFromContent('[link](https://example.com/api/v1/files/some-id/content) not-a-match')).toEqual(
      []
    );
  });

  test('returns an empty list for empty content', () => {
    expect(extractFileIdsFromContent('')).toEqual([]);
  });
});

describe('extractFileIdsFromValues', () => {
  const fileColumn: Column = { id: 'col-file', name: 'Attachment', type: 'file' };
  const stringColumn: Column = { id: 'col-text', name: 'Notes', type: 'string' };
  const columns: Column[] = [fileColumn, stringColumn];

  test('returns the ids of file values whose column is a file column', () => {
    const values: Record<string, PageValue> = {
      [fileColumn.id]: { type: 'file', value: 'file-1' },
    };
    expect(extractFileIdsFromValues(values, columns)).toEqual(['file-1']);
  });

  test('dedupes ids referenced by multiple file columns', () => {
    const secondFileColumn: Column = { id: 'col-file-2', name: 'Other Attachment', type: 'file' };
    const values: Record<string, PageValue> = {
      [fileColumn.id]: { type: 'file', value: 'file-1' },
      [secondFileColumn.id]: { type: 'file', value: 'file-1' },
    };
    expect(extractFileIdsFromValues(values, [...columns, secondFileColumn])).toEqual(['file-1']);
  });

  test('ignores null values', () => {
    const values: Record<string, PageValue> = {
      [fileColumn.id]: { type: 'file', value: null },
    };
    expect(extractFileIdsFromValues(values, columns)).toEqual([]);
  });

  test('ignores values whose column is no longer a file column (e.g. deleted/retyped)', () => {
    const values: Record<string, PageValue> = {
      [fileColumn.id]: { type: 'file', value: 'file-1' },
    };
    // `columns` no longer contains `fileColumn` (simulating a deleted column) — the stale value
    // must not contribute an id.
    expect(extractFileIdsFromValues(values, [stringColumn])).toEqual([]);
  });

  test('ignores non-file values entirely', () => {
    const values: Record<string, PageValue> = {
      [stringColumn.id]: { type: 'string', value: 'hello' },
    };
    expect(extractFileIdsFromValues(values, columns)).toEqual([]);
  });

  test('returns an empty list for empty/undefined input', () => {
    expect(extractFileIdsFromValues({}, columns)).toEqual([]);
    expect(extractFileIdsFromValues(undefined, columns)).toEqual([]);
  });
});
