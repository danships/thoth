// Non-authoritative cookie recording the slug of the workspace the user was last active in, so
// the root `/` (and the legacy bare `/pages/**` redirect) can send them back where they left
// off. It only ever selects a redirect *target* — membership is always re-validated server-side
// regardless of the cookie value (see `src/app/[workspaceSlug]/layout.tsx`).
export const LAST_WORKSPACE_COOKIE = 'thoth_last_workspace';

// 1 year, in seconds.
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Client-side writer used when a workspace becomes the active one (navigating into
 * `/[workspaceSlug]/...`). Kept free of any server-only imports so it can be called from client
 * components.
 */
export function writeLastWorkspaceSlugCookie(slug: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  // The CookieStore API isn't universally available; this is a non-authoritative redirect-hint
  // cookie, so writing it via document.cookie is acceptable here.
  // eslint-disable-next-line unicorn/no-document-cookie
  document.cookie = `${LAST_WORKSPACE_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
