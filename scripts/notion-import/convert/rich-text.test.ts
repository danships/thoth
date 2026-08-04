import { describe, it, expect } from 'vitest';
import { richTextToMarkdown, richTextToPlainText, isSafeUrl } from './rich-text';

describe('richTextToMarkdown', () => {
  it('returns an empty string for empty/undefined input', () => {
    expect(richTextToMarkdown(undefined)).toBe('');
    expect(richTextToMarkdown([])).toBe('');
  });

  it('applies bold, italic, strikethrough and code annotations', () => {
    expect(richTextToMarkdown([{ plain_text: 'bold', annotations: { bold: true } }])).toBe('**bold**');
    expect(richTextToMarkdown([{ plain_text: 'italic', annotations: { italic: true } }])).toBe('_italic_');
    expect(richTextToMarkdown([{ plain_text: 'gone', annotations: { strikethrough: true } }])).toBe('~~gone~~');
    expect(richTextToMarkdown([{ plain_text: 'code', annotations: { code: true } }])).toBe('`code`');
  });

  it('combines multiple annotations', () => {
    expect(richTextToMarkdown([{ plain_text: 'both', annotations: { bold: true, italic: true } }])).toBe('_**both**_');
  });

  it('renders a safe link as a Markdown link', () => {
    expect(richTextToMarkdown([{ plain_text: 'click', href: 'https://example.com' }])).toBe(
      '[click](https://example.com)'
    );
  });

  it('does not render an unsafe-scheme link as a Markdown link', () => {
    expect(richTextToMarkdown([{ plain_text: 'click', href: 'javascript:alert(1)' }])).toBe('click');
  });

  it('escapes Markdown special characters in plain text', () => {
    expect(richTextToMarkdown([{ plain_text: '1. *item*' }])).toBe(String.raw`1\. \*item\*`);
  });

  it('joins multiple segments', () => {
    expect(richTextToMarkdown([{ plain_text: 'Hello ' }, { plain_text: 'world', annotations: { bold: true } }])).toBe(
      'Hello **world**'
    );
  });
});

describe('richTextToPlainText', () => {
  it('concatenates plain_text without any Markdown formatting', () => {
    expect(richTextToPlainText([{ plain_text: 'Hello ', annotations: { bold: true } }, { plain_text: 'world' }])).toBe(
      'Hello world'
    );
  });

  it('returns an empty string for empty/undefined input', () => {
    expect(richTextToPlainText(undefined)).toBe('');
    expect(richTextToPlainText(null)).toBe('');
  });
});

describe('isSafeUrl', () => {
  it('allows http, https and mailto', () => {
    // eslint-disable-next-line unicorn/prefer-https -- intentionally testing http:// support
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('mailto:a@example.com')).toBe(true);
  });

  it('rejects other schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});
