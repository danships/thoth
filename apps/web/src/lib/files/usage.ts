import { getContainerRepository, getFileUsageRepository, getUploadedFileRepository } from '@/lib/database';
import { assertFileAccess } from '@/lib/files/access';
import type { ApiKeySession } from '@/lib/auth/session';
import type { Column, PageValue } from '@/types/schemas/entities/container';

// SuperSave has no composite-unique-constraint support (see `src/types/schemas/entities/
// file-usage.ts`), so `(fileId, containerId)` uniqueness cannot be enforced at the database
// level. This in-process lock, keyed by `containerId` — mirroring the mitigation used for
// workspace slugs in `src/lib/database/workspace-slug.ts` — serializes concurrent
// `syncFileUsageForPage` calls for the *same* page so a query-then-create race can't create
// duplicate rows. It does not protect against races across multiple server instances.
const containerSyncLocks = new Map<string, Promise<unknown>>();

async function withContainerSyncLock<T>(containerId: string, task: () => Promise<T>): Promise<T> {
  const previous = containerSyncLocks.get(containerId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  containerSyncLocks.set(containerId, tracked);
  try {
    return await run;
  } finally {
    if (containerSyncLocks.get(containerId) === tracked) {
      containerSyncLocks.delete(containerId);
    }
  }
}

// Anchored with a negative lookbehind so a path segment embedded in an unrelated external URL
// (e.g. `https://example.com/api/v1/files/some-id/content`, where the character preceding
// `/api` is part of the hostname) is never mistaken for our own served-file path.
const FILE_URL_PATTERN = /(?<![\w.])\/api\/v1\/files\/([\w-]+)\/content/g;

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
 * Scans a page's `values` for `file` column values and returns the referenced file ids,
 * deduplicated. Unlike `extractFileIdsFromContent` (which scans markdown), this reads the
 * structured `PageValue` union directly — a file-column value stores its file id in
 * `page.values`, never in markdown (THOTH-054). Only columns whose *current* `type` is `file`
 * are considered, so a value left over from a since-retyped/deleted column is ignored; a `null`
 * value (empty cell) contributes nothing.
 */
export function extractFileIdsFromValues(values: Record<string, PageValue> | undefined, columns: Column[]): string[] {
  if (!values) {
    return [];
  }

  const fileColumnIds = new Set(columns.filter((column) => column.type === 'file').map((column) => column.id));

  const ids = new Set<string>();
  for (const [columnId, value] of Object.entries(values)) {
    if (fileColumnIds.has(columnId) && value.type === 'file' && value.value) {
      ids.add(value.value);
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
 * Uniqueness of `(fileId, containerId)` is enforced at the application layer (query, then create
 * only what's missing), serialized per-`containerId` via `withContainerSyncLock` since SuperSave
 * has no composite-unique-constraint support to fall back on.
 */
export async function syncFileUsageForPage(
  containerId: string,
  session: ApiKeySession,
  fileIds: string[]
): Promise<void> {
  return withContainerSyncLock(containerId, () => doSyncFileUsageForPage(containerId, session, fileIds));
}

async function doSyncFileUsageForPage(containerId: string, session: ApiKeySession, fileIds: string[]): Promise<void> {
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

  const uploadedFileRepository = toCreate.length > 0 ? await getUploadedFileRepository() : undefined;

  for (const fileId of toCreate) {
    // A page's content can only grant `file-usage` access to files the caller can already reach
    // (their own uploads, or files already visible via another page) — otherwise referencing an
    // arbitrary/nonexistent file id in markdown content would silently grant access to it. Skip
    // (rather than fail the whole save) for ids that don't validate.
    const file = await uploadedFileRepository!.getOneByQuery(uploadedFileRepository!.createQuery().eq('id', fileId));
    if (!file) {
      continue;
    }
    try {
      await assertFileAccess(session, file);
    } catch {
      continue;
    }

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
