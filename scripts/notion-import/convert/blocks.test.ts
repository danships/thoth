import { describe, it, expect } from 'vitest';
import { blocksToMarkdown, type NotionBlockNode } from './blocks';

function block(
  id: string,
  type: string,
  payload: Record<string, unknown> = {},
  extra: Partial<NotionBlockNode> = {}
): NotionBlockNode {
  return { id, type, payload, ...extra };
}

function rt(text: string) {
  return [{ plain_text: text }];
}

describe('blocksToMarkdown', () => {
  it('converts a paragraph to plain Markdown', () => {
    const result = blocksToMarkdown([block('1', 'paragraph', { rich_text: rt('Hello world') })]);
    expect(result.markdown).toBe('Hello world');
    expect(result.unsupportedTypes).toEqual([]);
  });

  it('converts headings 1-3', () => {
    expect(blocksToMarkdown([block('1', 'heading_1', { rich_text: rt('A') })]).markdown).toBe('# A');
    expect(blocksToMarkdown([block('1', 'heading_2', { rich_text: rt('A') })]).markdown).toBe('## A');
    expect(blocksToMarkdown([block('1', 'heading_3', { rich_text: rt('A') })]).markdown).toBe('### A');
  });

  it('retains Markdown for descendants nested under a (toggleable) heading', () => {
    const heading = block(
      '1',
      'heading_1',
      { rich_text: rt('Title') },
      { children: [block('1a', 'paragraph', { rich_text: rt('nested content') })] }
    );
    expect(blocksToMarkdown([heading]).markdown).toBe('# Title\nnested content');
  });

  it('converts a quote', () => {
    expect(blocksToMarkdown([block('1', 'quote', { rich_text: rt('quoted') })]).markdown).toBe('> quoted');
  });

  it('converts a divider', () => {
    expect(blocksToMarkdown([block('1', 'divider', {})]).markdown).toBe('---');
  });

  it('converts a code block preserving the language and raw (unescaped) text', () => {
    const result = blocksToMarkdown([block('1', 'code', { rich_text: rt('const a = 1;'), language: 'javascript' })]);
    expect(result.markdown).toBe('```javascript\nconst a = 1;\n```');
  });

  it('widens the code fence delimiter so it is never closed early by backticks in the content', () => {
    const result = blocksToMarkdown([block('1', 'code', { rich_text: rt('```nested fence```'), language: '' })]);
    expect(result.markdown).toBe('````\n```nested fence```\n````');
  });

  it('converts an equation to a $$ block', () => {
    expect(blocksToMarkdown([block('1', 'equation', { expression: 'E=mc^2' })]).markdown).toBe('$$E=mc^2$$');
  });

  it('converts bulleted and numbered list items', () => {
    expect(blocksToMarkdown([block('1', 'bulleted_list_item', { rich_text: rt('item') })]).markdown).toBe('- item');
    expect(blocksToMarkdown([block('1', 'numbered_list_item', { rich_text: rt('item') })]).markdown).toBe('1. item');
  });

  it('converts a to_do item, reflecting the checked state', () => {
    expect(blocksToMarkdown([block('1', 'to_do', { rich_text: rt('task'), checked: true })]).markdown).toBe(
      '- [x] task'
    );
    expect(blocksToMarkdown([block('1', 'to_do', { rich_text: rt('task'), checked: false })]).markdown).toBe(
      '- [ ] task'
    );
  });

  it('indents a to_do block child the same way as a nested bulleted list item', () => {
    const todo = block(
      '1',
      'to_do',
      { rich_text: rt('parent task'), checked: false },
      { children: [block('1a', 'paragraph', { rich_text: rt('child note') })] }
    );
    expect(blocksToMarkdown([todo]).markdown).toBe('- [ ] parent task\n  child note');
  });

  it('degrades a callout to a blockquote', () => {
    expect(blocksToMarkdown([block('1', 'callout', { rich_text: rt('note') })]).markdown).toBe('> note');
  });

  it('degrades a toggle to a heading, losing collapsibility', () => {
    expect(blocksToMarkdown([block('1', 'toggle', { rich_text: rt('collapsible') })]).markdown).toBe(
      '#### collapsible'
    );
  });

  it('converts a table with a header row and body rows', () => {
    const table = block(
      '1',
      'table',
      {},
      {
        children: [
          block('1a', 'table_row', { cells: [rt('Name'), rt('Age')] }),
          block('1b', 'table_row', { cells: [rt('Alice'), rt('30')] }),
        ],
      }
    );
    const result = blocksToMarkdown([table]);
    expect(result.markdown).toBe(['| Name | Age |', '| --- | --- |', '| Alice | 30 |'].join('\n'));
  });

  it('embeds an uploaded image as a Markdown image', () => {
    const result = blocksToMarkdown([
      block('1', 'image', {}, { upload: { id: 'file-1', url: 'https://cdn.example.com/f1.png', filename: 'f1.png' } }),
    ]);
    expect(result.markdown).toBe('![f1.png](https://cdn.example.com/f1.png)');
  });

  it('embeds an uploaded file/video/audio as a thoth-file-block HTML comment token', () => {
    const upload = { id: 'file-2', url: 'https://cdn.example.com/f2.pdf', filename: 'f2.pdf' };
    const result = blocksToMarkdown([block('1', 'file', {}, { upload })]);
    expect(result.markdown).toMatch(/^<!--thoth-file-block:file:.+-->$/);
    const encoded = result.markdown.match(/thoth-file-block:file:(.+)-->/)?.[1] ?? '';
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual({ id: 'file-2', name: 'f2.pdf' });
  });

  it('falls back to a link to the original Notion URL when a file upload failed', () => {
    const result = blocksToMarkdown([
      block('1', 'file', {}, { upload: null, originalUrl: 'https://notion.so/original.pdf' }),
    ]);
    expect(result.markdown).toBe('[file](https://notion.so/original.pdf)');
  });

  it('appends the caption after an uploaded image', () => {
    const result = blocksToMarkdown([
      block(
        '1',
        'image',
        { caption: rt('a scenic photo') },
        { upload: { id: 'file-1', url: 'https://cdn.example.com/f1.png', filename: 'f1.png' } }
      ),
    ]);
    expect(result.markdown).toBe('![f1.png](https://cdn.example.com/f1.png)\na scenic photo');
  });

  it('appends the caption after a fallback link when a file upload failed', () => {
    const result = blocksToMarkdown([
      block(
        '1',
        'file',
        { caption: rt('a fallback caption') },
        { upload: null, originalUrl: 'https://notion.so/original.pdf' }
      ),
    ]);
    expect(result.markdown).toBe('[file](https://notion.so/original.pdf)\na fallback caption');
  });

  it('converts bookmark/embed/link_preview to a plain link', () => {
    expect(blocksToMarkdown([block('1', 'bookmark', { url: 'https://example.com' })]).markdown).toBe(
      '[https://example.com](https://example.com)'
    );
  });

  it('leaves a resolvable placeholder for child_page and link_to_page blocks', () => {
    expect(blocksToMarkdown([block('1', 'child_page', {})]).markdown).toBe('{{notion-page-link:1}}');
    expect(blocksToMarkdown([block('1', 'link_to_page', { page_id: 'target-id' })]).markdown).toBe(
      '{{notion-page-link:target-id}}'
    );
  });

  it('inlines synced_block content once', () => {
    const result = blocksToMarkdown([
      block('1', 'synced_block', {}, { children: [block('1a', 'paragraph', { rich_text: rt('synced') })] }),
    ]);
    expect(result.markdown).toBe('synced');
  });

  it('flattens column_list/column into a linear sequence', () => {
    const columnList = block(
      '1',
      'column_list',
      {},
      {
        children: [
          block('1a', 'column', {}, { children: [block('1a1', 'paragraph', { rich_text: rt('left') })] }),
          block('1b', 'column', {}, { children: [block('1b1', 'paragraph', { rich_text: rt('right') })] }),
        ],
      }
    );
    expect(blocksToMarkdown([columnList]).markdown).toBe('left\n\nright');
  });

  it('reports table_of_contents/breadcrumb as unsupported and drops them', () => {
    const result = blocksToMarkdown([block('1', 'table_of_contents', {}), block('2', 'breadcrumb', {})]);
    expect(result.markdown).toBe('');
    expect(result.unsupportedTypes).toEqual(['table_of_contents', 'breadcrumb']);
  });

  it('drops unknown block types and counts them as unsupported', () => {
    const result = blocksToMarkdown([block('1', 'some_future_block_type', {})]);
    expect(result.markdown).toBe('');
    expect(result.unsupportedTypes).toEqual(['some_future_block_type']);
  });

  it('skips archived blocks entirely', () => {
    const result = blocksToMarkdown([block('1', 'paragraph', { rich_text: rt('gone') }, { archived: true })]);
    expect(result.markdown).toBe('');
  });

  it('joins multiple top-level blocks with a blank line between them', () => {
    const result = blocksToMarkdown([
      block('1', 'paragraph', { rich_text: rt('first') }),
      block('2', 'paragraph', { rich_text: rt('second') }),
    ]);
    expect(result.markdown).toBe('first\n\nsecond');
  });
});
