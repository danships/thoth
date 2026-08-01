import { getFileUsageRepository } from '@/lib/database';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { ApiKeySession } from '@/lib/auth/session';
import type { UploadedFile } from '@/types/database';

/**
 * The sole authorization chokepoint for reading an uploaded file's bytes (`GET
 * /files/:id/content`) or metadata. Passes if the caller is the file's own uploader, or if the
 * caller can access at least one page referenced by the file's `file-usage` rows — this is
 * `file-usage`'s role as the file's *visibility boundary* (see the entity's doc comment):
 * workspace membership alone is deliberately never sufficient. Throws `ForbiddenError` (403) if
 * neither condition holds.
 */
export async function assertFileAccess(session: ApiKeySession, file: UploadedFile): Promise<void> {
  if (file.userId === session.user.id) {
    return;
  }

  const fileUsageRepository = await getFileUsageRepository();
  const usageRows = await fileUsageRepository.getByQuery(fileUsageRepository.createQuery().eq('fileId', file.id));

  for (const usageRow of usageRows) {
    try {
      const page = await pageRetriever.retrievePage(usageRow.containerId, session.user.id);
      await assertGrantAllowsContainerForSession(session, page);
      return;
    } catch (error) {
      // Only an authorization/access-denied failure for *this particular* linking page means
      // try the next one — any other error (storage/database failure, a programming bug, etc.)
      // must propagate rather than being silently swallowed into an eventual `ForbiddenError`.
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        continue;
      }
      throw error;
    }
  }

  throw new ForbiddenError('You do not have access to this file');
}
