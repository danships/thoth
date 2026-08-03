import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { parseMarkdownToBlocks, serializeBlocksToMarkdown, type MarkdownBlockEditor } from './markdown-blocks';

describe('markdown-blocks', () => {
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

  let markdown = '';

  beforeAll(() => {
    markdown = serializeBlocksToMarkdown(stubEditor, document);
  });

  afterAll(() => {
    markdown = '';
  });

  test('preserves special file blocks as stable tokens during serialization', () => {
    // The file/video blocks are preserved as stable, percent-encoded tokens, not degraded by the
    // (stub) lossy serialiser.
    expect(markdown).toMatch(/<!--thoth-file-block:file:.*api%2Fv1%2Ffiles%2Fabc%2Fcontent.*-->/);
    expect(markdown).toMatch(/<!--thoth-file-block:video:.*api%2Fv1%2Ffiles%2Fvid%2Fcontent.*-->/);
  });

  test('round-trips mixed documents with special blocks intact', () => {
    const roundTripped = parseMarkdownToBlocks(stubEditor, markdown);

    expect(roundTripped.length).toBe(4);
    expect(roundTripped[0]?.type).toBe('paragraph');
    expect(roundTripped[1]?.type).toBe('file');
    expect((roundTripped[1]?.props as { url: string }).url).toBe('/api/v1/files/abc/content');
    expect((roundTripped[1]?.props as { name: string }).name).toBe('report.pdf');
    expect(roundTripped[2]?.type).toBe('paragraph');
    expect(roundTripped[3]?.type).toBe('video');
    expect((roundTripped[3]?.props as { caption: string }).caption).toBe('demo');
  });

  test('round-trips plain documents through the normal path only', () => {
    const plainMarkdown = serializeBlocksToMarkdown(stubEditor, [
      { type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Just text' }] },
    ]);
    expect(plainMarkdown).not.toMatch(/thoth-file-block/);
    const plainRoundTripped = parseMarkdownToBlocks(stubEditor, plainMarkdown);
    expect(plainRoundTripped.length).toBe(1);
    expect(plainRoundTripped[0]?.type).toBe('paragraph');
  });

  test('escapes literal comment terminators in block props', () => {
    // A prop value containing a literal `-->` (e.g. an attacker/user-controlled filename) must not
    // prematurely close the HTML comment token or corrupt/truncate the payload on round-trip.
    const dangerousDocument = [
      { type: 'file', props: { url: '/api/v1/files/evil/content', name: '-->malicious<script>', caption: '' } },
      { type: 'paragraph', props: {}, content: [{ type: 'text', text: 'After' }] },
    ];
    const dangerousMarkdown = serializeBlocksToMarkdown(stubEditor, dangerousDocument);
    expect(dangerousMarkdown.replace(/-->\n/, '')).not.toMatch(/--><\/script>|malicious<script>-->/);
    const dangerousRoundTripped = parseMarkdownToBlocks(stubEditor, dangerousMarkdown);
    expect(dangerousRoundTripped.length).toBe(2);
    expect(dangerousRoundTripped[0]?.type).toBe('file');
    expect((dangerousRoundTripped[0]?.props as { name: string }).name).toBe('-->malicious<script>');
    expect(dangerousRoundTripped[1]?.type).toBe('paragraph');
  });
});
