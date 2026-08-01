import { getContainerRepository, getFileUsageRepository } from '@/lib/database';
import type { ApiKeySession } from '@/lib/auth/session';

const FILE_URL_PATTERN = /\/api\/v1\/files\/([\w-]+)\/content/g;

/**
 * Scans persisted page markdown for served-file URLs (`/api/v1/files/<id>/content`, emitted by
 * both the upload response and the custom markdown (de)serialisation in
 * `src/lib/files/markdown-blocks.ts`) and returns the referenced file ids, deduplicated. Used to
 * reconcile `file-usage` rows whenever a page's content is saved.
 */
export function extractFileIdsFromContent(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(FILE_URL_PATTERN)) {
    const id = match[1];
    if (id) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Reconciles the `file-usage` rows for `containerId` against the set of file ids currently
 * referenced by its (just-persisted) markdown content: creates rows for newly-referenced files
 * and deletes rows for files no longer referenced. Never touches `file-usage` rows belonging to
 * *other* containers, so a file that's also used on another page stays retrievable there even
 * after being removed from this one (see the "file used on multiple pages" edge case).
 *
 * Uniqueness of `(fileId, containerId)` is enforced here at the application layer (query, then
 * create only what's missing) rather than via a DB constraint.
 */
export async function syncFileUsageForPage(
  containerId: string,
  session: ApiKeySession,
  fileIds: string[]
): Promise<void> {
  const fileUsageRepository = await getFileUsageRepository();

  const existingRows = await fileUsageRepository.getByQuery(
    fileUsageRepository.createQuery().eq('containerId', containerId)
  );

  const desiredIds = new Set(fileIds);
  const existingIdsByFileId = new Map(existingRows.map((row) => [row.fileId, row]));

  const toCreate = [...desiredIds].filter((fileId) => !existingIdsByFileId.has(fileId));
  const toDelete = existingRows.filter((row) => !desiredIds.has(row.fileId));

  const now = new Date().toISOString();
  const workspaceId =
    toCreate.length > 0
      ? (session.appContext?.accessGrant.workspaceId ?? (await resolveWorkspaceId(containerId)))
      : undefined;

  for (const fileId of toCreate) {
    await fileUsageRepository.create({
      fileId,
      containerId,
      workspaceId: workspaceId!,
      userId: session.user.id,
      createdAt: now,
    });
  }

  for (const row of toDelete) {
    await fileUsageRepository.deleteUsingId(row.id);
  }
}

// Resolves the owning container's workspaceId when it isn't already available from an
// App-key session's access grant (the common, session-cookie case). Kept as a small internal
// helper rather than requiring every call site to pass `workspaceId` explicitly.
async function resolveWorkspaceId(containerId: string): Promise<string> {
  const containerRepository = await getContainerRepository();
  const container = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', containerId));
  if (!container) {
    throw new Error(`Container ${containerId} not found while syncing file usage`);
  }
  return container.workspaceId;
}
