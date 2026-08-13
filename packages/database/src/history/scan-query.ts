import { getPageRevisionRepository } from '../repositories.js';
import type { PageRevision } from '../types.js';

/**
 * Stable `(createdAt, id)` cursor pagination over `page-revision` rows (THOTH-062), mirroring
 * the cursor pattern already used by the pages-tree/page-history API routes: order by
 * `createdAt` ascending, break ties by `id` ascending, and use `[createdAt, id]` of the last row
 * in a batch as the next cursor. Used by the `history.scan` job to discover distinct
 * `(workspaceId, containerId)` pairs without ever loading the whole `page-revision` table into
 * memory at once.
 */
export type PageRevisionScanCursor = { createdAt: string; id: string };

export type PageRevisionScanBatch = {
  rows: PageRevision[];
  nextCursor: PageRevisionScanCursor | null;
};

// Over-fetch buffer to absorb rows sharing the exact same `createdAt` as the cursor position
// without under-fetching real results — mirrors the pattern used by other cursor-paginated
// queries in this codebase (e.g. the pages-tree route).
const SAFETY_MARGIN = 5;

function compareOldestFirst(a: Pick<PageRevision, 'createdAt' | 'id'>, b: Pick<PageRevision, 'createdAt' | 'id'>): number {
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Fetches one bounded, `(createdAt, id)`-ordered batch of `page-revision` rows starting strictly
 * after `cursor` (or from the very beginning when `cursor` is `undefined`). Rows sharing the
 * cursor's exact `createdAt` are fetched then filtered/tie-broken in memory (SuperSave's query
 * builder can't express a portable compound `(createdAt, id) > (cursor)` boundary directly), the
 * same technique used elsewhere in this codebase for cursor pagination.
 */
export async function fetchPageRevisionScanBatch(
  cursor: PageRevisionScanCursor | undefined,
  limit: number
): Promise<PageRevisionScanBatch> {
  const repository = await getPageRevisionRepository();

  let query = repository.createQuery().sort('createdAt', 'asc').sort('id', 'asc').limit(limit + 1 + SAFETY_MARGIN);
  if (cursor) {
    query = query.gte('createdAt', cursor.createdAt);
  }

  const fetched = await repository.getByQuery(query);
  const sorted = fetched.toSorted(compareOldestFirst);

  const startIndex = cursor
    ? sorted.findIndex((row) => row.createdAt === cursor.createdAt && row.id === cursor.id) + 1
    : 0;

  const batch = sorted.slice(startIndex, startIndex + limit + 1);
  const hasMore = batch.length > limit;
  const rows = batch.slice(0, limit);

  return {
    rows,
    nextCursor: hasMore && rows.length > 0 ? { createdAt: rows.at(-1)!.createdAt, id: rows.at(-1)!.id } : null,
  };
}
