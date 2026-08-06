import { NextResponse } from 'next/server';
import { getLogger } from '@/lib/logger';
import { HttpError } from '@/lib/errors/http-error';

/**
 * Shared `HttpError` → `NextResponse` mapping for the manual (non-`apiRoute`) handlers under
 * `src/app/api/v1/files/` — upload and serve can't use `apiRoute` (it is JSON-only and always
 * responds via `NextResponse.json`, which doesn't fit `multipart/form-data` request bodies or a
 * binary streaming response), so they replicate this one piece of its behaviour directly rather
 * than duplicating it inline in each route.
 */
export async function toErrorResponse(error: unknown): Promise<NextResponse> {
  const logger = await getLogger();
  logger.error('API route error:', error);

  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.visibleError ? error.message : 'Something went wrong' },
      {
        status: error.httpErrorCode,
      }
    );
  }

  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
