import { describe, expect, it } from 'vitest';
import { resolveAuthOptions } from './auth-options';

describe('resolveAuthOptions', () => {
  it('returns production defaults (no extra trusted origins, no cookie override) in production', () => {
    const result = resolveAuthOptions({
      NODE_ENV: 'production',
      E2E_TEST_AUTH_RELAXATION_ENABLED: false,
      PLAYWRIGHT_BASE_URL: undefined,
    });

    expect(result).toEqual({ trustedOrigins: [] });
  });

  it('trusts localhost:3000 in development mode, without relaxing cookie security', () => {
    const result = resolveAuthOptions({
      NODE_ENV: 'development',
      E2E_TEST_AUTH_RELAXATION_ENABLED: false,
      PLAYWRIGHT_BASE_URL: undefined,
    });

    expect(result).toEqual({ trustedOrigins: ['http://localhost:3000'] });
  });

  it('trusts an exact loopback http origin and disables secure cookies when the switch is enabled', () => {
    const result = resolveAuthOptions({
      NODE_ENV: 'production',
      E2E_TEST_AUTH_RELAXATION_ENABLED: true,
      PLAYWRIGHT_BASE_URL: 'http://localhost:3000',
    });

    expect(result).toEqual({ trustedOrigins: ['http://localhost:3000'], useSecureCookies: false });
  });

  it('accepts 127.0.0.1 as a loopback origin', () => {
    const result = resolveAuthOptions({
      NODE_ENV: 'production',
      E2E_TEST_AUTH_RELAXATION_ENABLED: true,
      PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3000',
    });

    expect(result).toEqual({ trustedOrigins: ['http://127.0.0.1:3000'], useSecureCookies: false });
  });

  it('throws when the switch is enabled but PLAYWRIGHT_BASE_URL is missing', () => {
    expect(() =>
      resolveAuthOptions({
        NODE_ENV: 'production',
        E2E_TEST_AUTH_RELAXATION_ENABLED: true,
        PLAYWRIGHT_BASE_URL: undefined,
      })
    ).toThrow(/PLAYWRIGHT_BASE_URL is missing/);
  });

  it('throws on a malformed PLAYWRIGHT_BASE_URL', () => {
    expect(() =>
      resolveAuthOptions({
        NODE_ENV: 'production',
        E2E_TEST_AUTH_RELAXATION_ENABLED: true,
        PLAYWRIGHT_BASE_URL: 'not-a-url',
      })
    ).toThrow(/not a valid URL/);
  });

  it('throws on an https origin (protocol mismatch)', () => {
    expect(() =>
      resolveAuthOptions({
        NODE_ENV: 'production',
        E2E_TEST_AUTH_RELAXATION_ENABLED: true,
        PLAYWRIGHT_BASE_URL: 'https://localhost:3000',
      })
    ).toThrow(/must be an exact/);
  });

  it('throws on a non-loopback host', () => {
    expect(() =>
      resolveAuthOptions({
        NODE_ENV: 'production',
        E2E_TEST_AUTH_RELAXATION_ENABLED: true,
        // eslint-disable-next-line unicorn/prefer-https -- intentionally testing a non-loopback http origin
        PLAYWRIGHT_BASE_URL: 'http://example.com:3000',
      })
    ).toThrow(/must be an exact/);
  });

  it('throws on an origin with a path/query/hash', () => {
    expect(() =>
      resolveAuthOptions({
        NODE_ENV: 'production',
        E2E_TEST_AUTH_RELAXATION_ENABLED: true,
        PLAYWRIGHT_BASE_URL: 'http://localhost:3000/some-path',
      })
    ).toThrow(/must be an exact/);
  });
});
