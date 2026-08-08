import type { getEnvironment } from '../environment';

/**
 * Resolves the public, absolute base URL Thoth is served at.
 *
 * Prefers the explicit `APP_URL` env var (required in production, see README's "Production
 * deployment" section) and falls back to `http://localhost:${PORT}` for local development,
 * where `PORT` is read directly from `process.env` (Next.js/Node's own runtime var, consumed
 * by the HTTP server itself before `environmentSchema` is even validated — it is intentionally
 * not part of that schema) and defaults to `3000` if unset.
 *
 * This is used to explicitly wire `better-auth`'s `baseURL`/`trustedOrigins`
 * (`src/lib/auth/config.ts`) instead of relying on `better-auth`'s implicit request-header
 * inference, which is unsafe in production (trusts a potentially spoofed `Host` header).
 */
export function resolveAppUrl(environment: Awaited<ReturnType<typeof getEnvironment>>): string {
  if (environment.APP_URL) {
    return environment.APP_URL;
  }

  const port = process.env['PORT'] || '3000';
  return `http://localhost:${port}`;
}
