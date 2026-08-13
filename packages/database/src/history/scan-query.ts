import { getPageRevisionRepository } from '../repositories.js';
import type { PageRevision } from '../types.js';

/**
 * Stable `createdAt`-based cursor pagination over `page-revision` rows (THOTH-062). Used by the
 * `history.scan` job to discover distinct `(workspaceId, containerId)` pairs without ever loading
 * the whole `page-revision` table into memory at once.
 *
 * `id` is kept in the cursor shape for protocol/schema compatibility (`historyScanCursorSchema`
 * in `@thoth/job-protocol` requires it), but pagination is driven entirely by `createdAt`: every
 * distinct `createdAt` "group" of rows is always returned in full, atomically, within a single
 * batch — never split across two batches. This sidesteps a real inconsistency in the underlying
 * query builder, where `sort()` always applies `COLLATE NOCASE` while `gt`/`gte` filters compare
 * with plain binary collation; the (randomly generated, mixed-case) `page-revision` `id` column
 * can genuinely sort differently under the two collations, so an `id`-based tie-break/cursor
 * boundary could otherwise silently disagree with itself between pages and drop or duplicate
 * rows. `createdAt` is a fixed-width ISO-8601 string whose only letters are the constant `T`/`Z`,
 * so it never has that problem.
 */
export type PageRevisionScanCursor = { createdAt: string; id: string };

export type PageRevisionScanBatch = {
  rows: PageRevision[];
  nextCursor: PageRevisionScanCursor | null;
};

// Generous cap on how many rows a single `createdAt` group may contain — large enough that a
// realistic same-instant write burst (or fixture-aged rows all backdated to one identical
// timestamp) is never truncated, while still bounding a single query.
const MAX_GROUP_SIZE = 5000;

type PageRevisionRepository = Awaited<ReturnType<typeof getPageRevisionRepository>>;

/** Finds the smallest `createdAt` strictly after `floor` (or the very first, if `floor` is
 * `undefined`), or `undefined` once the table is exhausted. */
async function findNextDistinctTimestamp(
  repository: PageRevisionRepository,
  floor: string | undefined
): Promise<string | undefined> {
  let query = repository.createQuery().sort('createdAt', 'asc').limit(1);
  if (floor !== undefined) {
    query = query.gt('createdAt', floor);
  }
  const [row] = await repository.getByQuery(query);
  return row?.createdAt;
}

/** Fetches every row sharing the exact `createdAt` value, bounded by `MAX_GROUP_SIZE`. */
async function fetchTimestampGroup(repository: PageRevisionRepository, createdAt: string): Promise<PageRevision[]> {
  return repository.getByQuery(repository.createQuery().eq('createdAt', createdAt).limit(MAX_GROUP_SIZE));
}

/**
 * Fetches one bounded batch of `page-revision` rows with a `createdAt` strictly after `cursor`
 * (or from the very beginning when `cursor` is `undefined`), accumulating whole `createdAt`
 * groups (never a partial group) until at least `limit` rows have been collected or the table is
 * exhausted. Because every group is consumed atomically, resuming from `cursor.createdAt` with a
 * strict `gt` is always safe — even if the exact row that produced the cursor was since deleted
 * (e.g. by `history.maintain`), since the boundary is the timestamp value itself, not a specific
 * row's identity.
 */
export async function fetchPageRevisionScanBatch(
  cursor: PageRevisionScanCursor | undefined,
  limit: number
): Promise<PageRevisionScanBatch> {
  const repository = await getPageRevisionRepository();

  const collected: PageRevision[] = [];
  let floor = cursor?.createdAt;

  while (collected.length < limit) {
    const nextTimestamp = await findNextDistinctTimestamp(repository, floor);
    if (nextTimestamp === undefined) {
      floor = undefined;
      break;
    }
    const group = await fetchTimestampGroup(repository, nextTimestamp);
    collected.push(...group);
    floor = nextTimestamp;
  }

  if (collected.length === 0) {
    return { rows: [], nextCursor: null };
  }

  const hasMore = floor !== undefined && (await findNextDistinctTimestamp(repository, floor)) !== undefined;
  const lastRow = collected.at(-1)!;

  return {
    rows: collected,
    nextCursor: hasMore ? { createdAt: lastRow.createdAt, id: lastRow.id } : null,
  };
}
