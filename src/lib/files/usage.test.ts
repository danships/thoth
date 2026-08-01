import assert from 'node:assert/strict';
import { extractFileIdsFromContent } from './usage';

// Single reference
assert.deepEqual(extractFileIdsFromContent('Here is a file: [download](/api/v1/files/abc-123/content)'), ['abc-123']);

// Multiple distinct references preserve first-seen order
assert.deepEqual(
  extractFileIdsFromContent(
    '![img](/api/v1/files/img-1/content)\n\n[file](/api/v1/files/file-2/content)\n\n[again](/api/v1/files/img-1/content)'
  ),
  ['img-1', 'file-2']
);

// No matches
assert.deepEqual(extractFileIdsFromContent('Just plain text, no files here.'), []);

// Ignores unrelated URLs
assert.deepEqual(extractFileIdsFromContent('[link](https://example.com/api/v1/files/) not-a-match'), []);

// Empty content
assert.deepEqual(extractFileIdsFromContent(''), []);

console.log('✅  extractFileIdsFromContent tests passed');
