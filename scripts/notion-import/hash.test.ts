import { describe, it, expect } from 'vitest';
import { hashMarkdown, hashJson, normalizeMarkdown, canonicalize } from './hash';

describe('normalizeMarkdown', () => {
  it('normalises CRLF and CR line endings to LF', () => {
    expect(normalizeMarkdown('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('strips trailing whitespace on each line', () => {
    expect(normalizeMarkdown('hello   \nworld\t\n')).toBe('hello\nworld');
  });

  it('collapses trailing blank lines to a single trailing newline', () => {
    expect(normalizeMarkdown('content\n\n\n\n')).toBe('content');
  });

  it('preserves leading whitespace/indentation on the first line', () => {
    expect(normalizeMarkdown('  indented content\nmore\n\n')).toBe('  indented content\nmore');
  });
});

describe('hashMarkdown', () => {
  it('produces identical hashes for content that differs only in line endings/whitespace', () => {
    const unix = 'Hello world\n\nSecond paragraph.';
    const windows = 'Hello world  \r\n\r\nSecond paragraph.   \r\n';
    expect(hashMarkdown(unix)).toBe(hashMarkdown(windows));
  });

  it('produces different hashes for actually different content', () => {
    expect(hashMarkdown('Hello world')).not.toBe(hashMarkdown('Hello there'));
  });

  it('always prefixes the hash with sha256:', () => {
    expect(hashMarkdown('anything')).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('canonicalize', () => {
  it('sorts object keys recursively', () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('preserves array order (order is semantically meaningful)', () => {
    const result = canonicalize([{ b: 1 }, { a: 1 }]);
    expect(result).toEqual([{ b: 1 }, { a: 1 }]);
  });

  it('leaves primitives untouched', () => {
    expect(canonicalize('x')).toBe('x');
    expect(canonicalize(5)).toBe(5);
    expect(canonicalize(null)).toBe(null);
  });
});

describe('hashJson', () => {
  it('produces identical hashes regardless of key order', () => {
    const a = { columns: [{ name: 'A', type: 'string' }], meta: { z: 1, a: 2 } };
    const b = { meta: { a: 2, z: 1 }, columns: [{ type: 'string', name: 'A' }] };
    expect(hashJson(a)).toBe(hashJson(b));
  });

  it('produces different hashes for structurally different content', () => {
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }));
  });
});
