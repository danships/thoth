import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  it('redacts a Bearer token', () => {
    expect(redactSecrets('request failed: Authorization: Bearer abc123.def-456')).toBe(
      'request failed: Authorization: [REDACTED]'
    );
  });

  it('redacts a raw authorization header dump', () => {
    expect(redactSecrets('headers: { authorization: "Bearer topsecret" }')).toContain('[REDACTED]');
  });

  it('redacts a Notion internal-integration secret token', () => {
    expect(redactSecrets('token secret_abcDEF123 was rejected')).toBe('token [REDACTED] was rejected');
  });

  it('redacts a Notion OAuth token', () => {
    expect(redactSecrets('token ntn_abcDEF123 was rejected')).toBe('token [REDACTED] was rejected');
  });

  it('redacts credentials embedded in a URL', () => {
    expect(redactSecrets('fetch failed for https://user:pass@example.com/resource')).toBe(
      'fetch failed for https://[REDACTED]@example.com/resource'
    );
  });

  it('leaves ordinary error text untouched', () => {
    expect(redactSecrets('page not found: db-123')).toBe('page not found: db-123');
  });
});
