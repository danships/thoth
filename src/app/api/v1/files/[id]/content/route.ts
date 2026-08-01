import type { NextRequest } from 'next/server';
import { NextResponse, connection } from 'next/server';
import { getSessionOrApiKey } from '@/lib/auth/session';
import { getUploadedFileRepository } from '@/lib/database';
import { getStorageAdapter } from '@/lib/storage';
import { assertFileAccess } from '@/lib/files/access';
import { SAFE_INLINE_IMAGE_MIME_TYPES } from '@/lib/files/constants';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { toErrorResponse } from '@/lib/api/manual-route-error';
import { getLogger } from '@/lib/logger';

// Strips control characters and path separators from a filename before it's embedded in a
// `Content-Disposition` header, and percent-encodes it per RFC 5987 so non-ASCII names survive
// intact without ever letting the client-controlled filename influence header parsing.
function sanitizeFilenameForHeader(filename: string): string {
  const stripped = filename.replaceAll(/[\u0000-\u001F\u007F/\\]/g, '').trim() || 'download';
  return encodeURIComponent(stripped);
}

/**
 * `GET /api/v1/files/[id]/content` — serves the uploaded file's bytes. A manual handler (not
 * `apiRoute`) since the response is a binary stream, not `{ data: ... }` JSON. Authorization is
 * `assertFileAccess`: the file's own uploader, or anyone who can reach at least one page listed
 * in the file's `file-usage` rows — workspace membership alone is never sufficient (see
 * `src/lib/files/access.ts`).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const session = await getSessionOrApiKey(request);
    const { id } = await params;

    const uploadedFileRepository = await getUploadedFileRepository();
    const file = await uploadedFileRepository.getOneByQuery(uploadedFileRepository.createQuery().eq('id', id));

    if (!file) {
      throw new NotFoundError('File not found');
    }

    await assertFileAccess(session, file);

    const storageAdapter = await getStorageAdapter();
    const exists = await storageAdapter.exists(file.storageKey);
    if (!exists) {
      const logger = await getLogger();
      logger.error('files.serve.missing-on-disk', { fileId: file.id, storageKey: file.storageKey });
      throw new NotFoundError('File not found');
    }

    const stream = await storageAdapter.read(file.storageKey);

    // Never trust the stored MIME type for inline rendering beyond the curated safe-image
    // allowlist — anything else (including SVG, deliberately excluded from the allowlist) is
    // forced to a neutral content-type + attachment disposition so the browser can't execute it.
    const isSafeInlineImage = SAFE_INLINE_IMAGE_MIME_TYPES.includes(file.mimeType.toLowerCase());
    const contentType = isSafeInlineImage ? file.mimeType : 'application/octet-stream';
    const disposition = isSafeInlineImage ? 'inline' : 'attachment';
    const encodedFilename = sanitizeFilenameForHeader(file.filename);

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${disposition}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(file.size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
