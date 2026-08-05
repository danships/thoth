import { describe, test, expect } from 'vitest';
import { columnSchema, pageValueSchema } from './container';
import { createDataSourceColumnBodySchema } from '@/types/api/endpoints/create-data-source-column';
import { updateDataSourceColumnBodySchema } from '@/types/api/endpoints/update-data-source-column';

describe('file column/value schemas (THOTH-054)', () => {
  test('columnSchema accepts a file column', () => {
    const result = columnSchema.safeParse({ id: 'col-1', name: 'Attachment', type: 'file' });
    expect(result.success).toBe(true);
  });

  test('columnSchema rejects a file column with unexpected extra fields absent from the base shape', () => {
    // `id`/`name` are required by every column type — a file column missing them is invalid.
    const result = columnSchema.safeParse({ type: 'file' });
    expect(result.success).toBe(false);
  });

  test('createDataSourceColumnBodySchema accepts a file column create request', () => {
    const result = createDataSourceColumnBodySchema.safeParse({ name: 'Attachment', type: 'file' });
    expect(result.success).toBe(true);
  });

  test('updateDataSourceColumnBodySchema accepts a name-only file column update', () => {
    const result = updateDataSourceColumnBodySchema.safeParse({ name: 'Renamed', type: 'file' });
    expect(result.success).toBe(true);
  });

  test('pageValueSchema accepts a file value with a string id', () => {
    const result = pageValueSchema.safeParse({ type: 'file', value: 'uploaded-file-id' });
    expect(result.success).toBe(true);
  });

  test('pageValueSchema accepts a file value with a null id (empty cell)', () => {
    const result = pageValueSchema.safeParse({ type: 'file', value: null });
    expect(result.success).toBe(true);
  });

  test('pageValueSchema rejects a file value with a non-string, non-null id', () => {
    const result = pageValueSchema.safeParse({ type: 'file', value: 123 });
    expect(result.success).toBe(false);
  });

  test('pageValueSchema rejects a file value with an empty-string id', () => {
    // '' is not a valid uploaded-file id — `null` is the only valid "no file attached" state.
    const result = pageValueSchema.safeParse({ type: 'file', value: '' });
    expect(result.success).toBe(false);
  });
});
