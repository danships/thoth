import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Forwards the requested path (+ query string) as a request header so Server Components further
// down the tree (which don't otherwise have access to the current pathname, only their own
// `params`/`searchParams`) can reconstruct the full destination URL when redirecting — used by
// `src/app/[workspaceSlug]/layout.tsx` to redirect a renamed workspace's old slug to the new one
// while preserving the rest of the path (e.g. `/old-slug/pages/abc?v=xyz` -> `/new-slug/pages/abc?v=xyz`).
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
