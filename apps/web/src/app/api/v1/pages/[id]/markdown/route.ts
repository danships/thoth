import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSessionOrApiKey } from '@/lib/auth/session';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { HttpError } from '@/lib/errors/http-error';
import { getLogger } from '@/lib/logger';

/**
 * Serves a page's raw Markdown body as `text/markdown` (THOTH-048). This is the destination
 * `proxy.ts` rewrites the `.md`-suffixed page detail URL to (e.g. `/workspace/pages/{id}.md`
 * or the legacy `/pages/{id}.md`), so visiting that URL directly — in a browser or via `curl` —
 * returns the plain Markdown content instead of the React app shell.
 *
 * Deliberately not wrapped by `apiRoute` (and, for the same reason as `POST /files` and
 * `GET /files/{id}/content`, intentionally excluded from `src/lib/openapi/registry.ts`):
 * `apiRoute` always wraps its result as `{ data }` JSON, but callers requesting `.md` expect the
 * literal Markdown text as the response body. Reuses the same session/App-key auth
 * (`getSessionOrApiKey`) and content-access checks (`assertGrantAllowsContainerForSession`) as
 * every other page route, so both auth paths (cookie session and `Authorization: Bearer`
 * App API keys) work identically here.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionOrApiKey(request);
    const { id } = await params;

    const page = await pageRetriever.retrievePage(id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    const content = 'content' in page ? (page.content ?? '') : '';

    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  } catch (error) {
    const logger = await getLogger();
    logger.error('API route error:', error);

    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: error.visibleError ? error.message : 'Something went wrong' },
        { status: error.httpErrorCode }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
