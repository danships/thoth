import { describe, expect, it } from 'vitest';
import { safeUrlTransform } from './safe-url';

describe('safeUrlTransform', () => {
  it('permits relative paths', () => {
    expect(safeUrlTransform('/pages/123')).toBe('/pages/123');
    expect(safeUrlTransform('relative/path')).toBe('relative/path');
  });

  it('permits fragment identifiers', () => {
    expect(safeUrlTransform('#section-1')).toBe('#section-1');
  });

  it('permits query-only URLs', () => {
    expect(safeUrlTransform('?foo=bar')).toBe('?foo=bar');
  });

  it('permits http, https, and mailto URLs', () => {
    // eslint-disable-next-line unicorn/prefer-https -- intentionally testing the allowed `http:` scheme
    expect(safeUrlTransform('http://example.com')).toBe('http://example.com');
    expect(safeUrlTransform('https://example.com/path?x=1')).toBe('https://example.com/path?x=1');
    expect(safeUrlTransform('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('is case-insensitive for the scheme', () => {
    expect(safeUrlTransform('HTTPS://example.com')).toBe('HTTPS://example.com');
    expect(safeUrlTransform('MailTo:someone@example.com')).toBe('MailTo:someone@example.com');
  });

  it('trims surrounding whitespace before checking the scheme', () => {
    expect(safeUrlTransform('  https://example.com  ')).toBe('https://example.com');
  });

  it('strips embedded control characters used to obfuscate a scheme', () => {
    expect(safeUrlTransform('java\tscript:alert(1)')).toBe('');
    expect(safeUrlTransform('java\nscript:alert(1)')).toBe('');
  });

  it('rejects javascript: URLs', () => {
    expect(safeUrlTransform('javascript:alert(1)')).toBe('');
    expect(safeUrlTransform('JavaScript:alert(1)')).toBe('');
  });

  it('rejects data: URLs', () => {
    expect(safeUrlTransform('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('rejects vbscript: URLs', () => {
    expect(safeUrlTransform('vbscript:msgbox("x")')).toBe('');
  });

  it('rejects file: URLs', () => {
    expect(safeUrlTransform('file:///etc/passwd')).toBe('');
  });

  it('rejects malformed/empty URLs', () => {
    expect(safeUrlTransform('')).toBe('');
    expect(safeUrlTransform(' '.repeat(3))).toBe('');
  });

  it('treats unscheduled bare hostnames as relative/safe', () => {
    expect(safeUrlTransform('www.example.com')).toBe('www.example.com');
  });
});
