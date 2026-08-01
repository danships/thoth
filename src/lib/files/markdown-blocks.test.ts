import assert from 'node:assert/strict';
import { parseMarkdownToBlocks, serializeBlocksToMarkdown, type MarkdownBlockEditor } from './markdown-blocks';

// A stub editor mirroring the narrow slice of BlockNote's API this module depends on: text
// blocks serialise/parse via a trivial one-line-per-block "protocol" so the test doesn't need a
// DOM/ProseMirror environment, while `file`/`video`/`audio` blocks are expected to bypass this
// entirely (encoded as stable HTML-comment tokens instead).
const stubEditor: MarkdownBlockEditor = {
  blocksToMarkdownLossy: (blocks = []) => blocks.map((block) => `TEXT:${JSON.stringify(block)}`).join('\n'),
  tryParseMarkdownToBlocks: (markdown) =>
    markdown
      .split('\n')
      .filter((line) => line.startsWith('TEXT:'))
      .map((line) => JSON.parse(line.slice('TEXT:'.length))),
};

const document = [
  { type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Hello' }] },
  { type: 'file', props: { url: '/api/v1/files/abc/content', name: 'report.pdf', caption: '' } },
  { type: 'paragraph', props: {}, content: [{ type: 'text', text: 'World' }] },
  { type: 'video', props: { url: '/api/v1/files/vid/content', name: 'clip.mp4', caption: 'demo' } },
];

const markdown = serializeBlocksToMarkdown(stubEditor, document);

// The file/video blocks are preserved as stable tokens, not degraded by the (stub) lossy
// serialiser.
assert.match(markdown, /<!--thoth-file-block:file:.*"url":"\/api\/v1\/files\/abc\/content".*-->/);
assert.match(markdown, /<!--thoth-file-block:video:.*"url":"\/api\/v1\/files\/vid\/content".*-->/);

const roundTripped = parseMarkdownToBlocks(stubEditor, markdown);

assert.equal(roundTripped.length, 4);
assert.equal(roundTripped[0]?.type, 'paragraph');
assert.equal(roundTripped[1]?.type, 'file');
assert.equal((roundTripped[1]?.props as { url: string }).url, '/api/v1/files/abc/content');
assert.equal((roundTripped[1]?.props as { name: string }).name, 'report.pdf');
assert.equal(roundTripped[2]?.type, 'paragraph');
assert.equal(roundTripped[3]?.type, 'video');
assert.equal((roundTripped[3]?.props as { caption: string }).caption, 'demo');

// A document with no special blocks round-trips through the "normal" path only.
const plainMarkdown = serializeBlocksToMarkdown(stubEditor, [
  { type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Just text' }] },
]);
assert.doesNotMatch(plainMarkdown, /thoth-file-block/);
const plainRoundTripped = parseMarkdownToBlocks(stubEditor, plainMarkdown);
assert.equal(plainRoundTripped.length, 1);
assert.equal(plainRoundTripped[0]?.type, 'paragraph');

console.log('✅  markdown-blocks round-trip tests passed');
