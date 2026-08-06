import type { Environment } from '../environment';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export type ResolvedAuthOptions = {
  trustedOrigins: string[];
  /** `false` relaxes Better Auth's secure-cookie flag; `undefined` keeps the library default. */
  useSecureCookies?: boolean;
};

type AuthOptionsEnvironment = Pick<
  Environment,
  'NODE_ENV' | 'E2E_TEST_AUTH_RELAXATION_ENABLED' | 'PLAYWRIGHT_BASE_URL'
>;

/**
 * Resolves Better Auth's `trustedOrigins`/secure-cookie options.
 *
 * Production default (THOTH-042/THOTH-064): no extra trusted origins beyond the existing
 * dev-mode `localhost:3000` allowance, secure cookies enforced.
 *
 * The E2E-only relaxation is explicit and default-off
 * (`E2E_TEST_AUTH_RELAXATION_ENABLED`). It only takes effect when `PLAYWRIGHT_BASE_URL` is an
 * *exact* loopback HTTP origin (`http://localhost:<port>` or `http://127.0.0.1:<port>`, no
 * path/query/hash). Any other value — HTTPS, a non-loopback host, a malformed URL, or a missing
 * origin while the switch is enabled — fails closed by throwing, rather than silently falling
 * back to production defaults or a permissive wildcard.
 */
export function resolveAuthOptions(environment: AuthOptionsEnvironment): ResolvedAuthOptions {
  const productionDefaults: ResolvedAuthOptions = {
    trustedOrigins: environment.NODE_ENV === 'development' ? ['http://localhost:3000'] : [],
  };

  if (!environment.E2E_TEST_AUTH_RELAXATION_ENABLED) {
    return productionDefaults;
  }

  const rawOrigin = environment.PLAYWRIGHT_BASE_URL;
  if (!rawOrigin) {
    throw new Error(
      'E2E_TEST_AUTH_RELAXATION_ENABLED is set but PLAYWRIGHT_BASE_URL is missing. Refusing to relax auth security.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error(`PLAYWRIGHT_BASE_URL ("${rawOrigin}") is not a valid URL. Refusing to relax auth security.`);
  }

  const isExactLoopbackHttpOrigin =
    parsed.protocol === 'http:' &&
    LOOPBACK_HOSTNAMES.has(parsed.hostname) &&
    parsed.pathname === '/' &&
    parsed.search === '' &&
    parsed.hash === '';

  if (!isExactLoopbackHttpOrigin) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL ("${rawOrigin}") must be an exact http://localhost:<port> or ` +
        'http://127.0.0.1:<port> origin. Refusing to relax auth security.'
    );
  }

  return {
    trustedOrigins: [`${parsed.protocol}//${parsed.host}`],
    useSecureCookies: false,
  };
}
