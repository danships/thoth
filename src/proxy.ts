import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractPageId } from '@/lib/utils/page-url';

// Matches the `.md`-suffixed page detail URL — both `/{workspaceSlug}/pages/{id}.md` and the
// legacy bare `/pages/{id}.md` — capturing the page detail `[id]` route segment (THOTH-048),
// which may itself be a bare `id` or a `{titleSlug}-{id}` combo (THOTH-067); `extractPageId`
// below resolves it to the real `id`. The `workspaceSlug` segment (if present) is deliberately
// not captured/used any further: it's purely decorative in the browser URL, the same as the rest
// of the page detail route, since the destination route resolves/authorizes the page from its
// own `id` and `workspaceId` alone.
const MARKDOWN_URL_PATTERN = /^\/(?:[^/]+\/)?pages\/([^/]+)\.md$/;

// Forwards the requested path (+ query string) as a request header so Server Components further
// down the tree (which don't otherwise have access to the current pathname, only their own
// `params`/`searchParams`) can reconstruct the full destination URL when redirecting — used by
// `src/app/[workspaceSlug]/layout.tsx` to redirect a renamed workspace's old slug to the new one
// while preserving the rest of the path (e.g. `/old-slug/pages/abc?v=xyz` -> `/new-slug/pages/abc?v=xyz`).
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search);

  // THOTH-048: rewrite the `.md`-suffixed page detail URL to the dedicated Markdown API route
  // instead of rendering the React page shell. This only recognizes the URL shape and rewrites
  // it — the real session/App-key auth and content-access checks happen in the destination route
  // handler (`src/app/api/v1/pages/[id]/markdown/route.ts`). A rewrite (rather than a redirect)
  // preserves the original request as-is, including cookies and any `Authorization: ******
  // header, so both auth paths keep working unchanged and the browser's address bar still shows
  // the `.md` URL.
  const markdownMatch = request.nextUrl.pathname.match(MARKDOWN_URL_PATTERN);
  if (markdownMatch) {
    const [, routeId] = markdownMatch;
    const id = extractPageId(routeId ?? '');
    const url = request.nextUrl.clone();
    url.pathname = `/api/v1/pages/${id}/markdown`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
