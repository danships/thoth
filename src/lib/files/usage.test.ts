import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { extractFileIdsFromContent } from './usage';

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
