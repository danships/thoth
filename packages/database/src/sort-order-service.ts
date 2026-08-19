import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { getContainerRepository } from './repositories.js';
import { addWorkspaceIdToQuery } from './helpers.js';
import type { Container } from './types.js';

/**
 * Manual-order comparator for parented listings (child pages, data-source rows, sibling-group
 * rebalancing) — see THOTH-036. Treats a missing/null `sortOrder` as sorting last, so a stray
 * legacy row (e.g. one created before the backfill migration ran) falls to the end instead of
 * jumping to the top. Falls back to `id asc` as a final tiebreak when two rows share the same
 * `sortOrder` (or both are `null`), so the order is stable/deterministic instead of depending on
 * incidental fetch order — every caller (listing endpoints and `rebalanceSiblingGroup`) shares
 * this single implementation so they can never drift from one another.
 */
function compareIds(idA: string, idB: string): number {
  if (idA < idB) {
    return -1;
  }
  return idA > idB ? 1 : 0;
}

export function sortByManualOrder<T extends { id: string; sortOrder?: string | null | undefined }>(items: T[]): T[] {
  return items.toSorted((a, b) => {
    const aKey = a.sortOrder ?? null;
    const bKey = b.sortOrder ?? null;
    if (aKey === null && bKey === null) {
      return compareIds(a.id, b.id);
    }
    if (aKey === null) {
      return 1;
    }
    if (bKey === null) {
      return -1;
    }
    if (aKey < bKey) {
      return -1;
    }
    if (aKey > bKey) {
      return 1;
    }
    return compareIds(a.id, b.id);
  });
}

/**
 * Returns the lexicographically-largest `sortOrder` key currently in use within a sibling
 * group (`workspaceId` + `parentId`), or `null` if the group is empty. Used to mint an
 * end-of-list key for pages parented to a data source (`generateKeyBetween(max, null)`).
 *
 * Computed in application code (fetch + `sortByManualOrder`) rather than a DB-level
 * `sort('sortOrder', 'desc')`, because SuperSave's SQLite adapter sorts text columns with
 * `COLLATE NOCASE`, which disagrees with `fractional-indexing`'s case-sensitive byte ordering.
 */
export async function getMaxSiblingSortOrder(workspaceId: string, parentId: string): Promise<string | null> {
  const containerRepository = await getContainerRepository();
  const siblings = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId).eq('parentId', parentId)
  );
  const orderedWithKeys = sortByManualOrder(siblings).filter((sibling) => sibling.sortOrder != null);
  return orderedWithKeys.at(-1)?.sortOrder ?? null;
}

/**
 * Returns the `sortOrder` of the sibling that currently sorts first (per `sortByManualOrder`)
 * within a sibling group (`workspaceId` + `parentId`), or `null` if the group is empty. Used to
 * mint a start-of-list key for pages parented to another page (`generateKeyBetween(null, min)`).
 * Data-source rows instead use `getMaxSiblingSortOrder` to append at the bottom.
 *
 * Computed in application code (fetch + `sortByManualOrder`) rather than a DB-level
 * `sort('sortOrder', 'asc')`, because SuperSave's SQLite adapter sorts text columns with
 * `COLLATE NOCASE` — case-insensitive — which disagrees with `fractional-indexing`'s
 * case-sensitive byte ordering (e.g. `NOCASE` would rank `'a0'` before `'Zz'`, even though
 * `'Zz' < 'a0'` byte-wise, which is the order the keys were actually generated in).
 */
export async function getMinSiblingSortOrder(workspaceId: string, parentId: string): Promise<string | null> {
  const containerRepository = await getContainerRepository();
  const siblings = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId).eq('parentId', parentId)
  );
  const ordered = sortByManualOrder(siblings);
  return ordered[0]?.sortOrder ?? null;
}

/**
 * Wraps `generateKeyBetween` with a rebalance-on-collision fallback: if the two anchor keys are
 * adjacent/invalid (`before >= after`, which `generateKeyBetween` itself throws for — e.g. two
 * siblings that ended up with a duplicate `sortOrder` from a prior race), the whole sibling
 * group is rebalanced (`rebalanceSiblingGroup`) to regain even spacing, and the key is
 * recomputed between the moved page's (now well-spaced) neighbours, looked up by id since the
 * rebalance invalidates every previous key string.
 */
export async function computeReorderKey(options: {
  workspaceId: string;
  parentId: string;
  movedId: string;
  beforeId?: string | null;
  beforeKey: string | null;
  afterId?: string | null;
  afterKey: string | null;
}): Promise<string> {
  const { workspaceId, parentId, beforeId, beforeKey, afterId, afterKey } = options;

  try {
    return generateKeyBetween(beforeKey, afterKey);
  } catch {
    // Collision: the group has run out of room between these two neighbours. Rebalance the
    // entire group to restore even spacing, then recompute using the moved page's new
    // neighbours' ids — every previous key string is stale after a rebalance, so anchors must
    // be re-resolved by id rather than by their old key value.
    const rebalanced = await rebalanceSiblingGroup(workspaceId, parentId);
    const siblingsById = new Map(rebalanced.map((container) => [container.id, container]));

    const newBeforeKey = beforeId ? (siblingsById.get(beforeId)?.sortOrder ?? null) : beforeKey;
    const newAfterKey = afterId ? (siblingsById.get(afterId)?.sortOrder ?? null) : afterKey;

    return generateKeyBetween(newBeforeKey ?? null, newAfterKey ?? null);
  }
}

/**
 * Rebalances an entire sibling group (`workspaceId` + `parentId`) by regenerating strictly
 * ascending, evenly-spaced `sortOrder` keys (`generateNKeysBetween(null, null, n)`) in the
 * group's current manual order (`sortByManualOrder` — nulls-last, `id asc` tiebreak) — i.e. it
 * preserves the existing relative (visible) order, it just regains spacing between keys.
 * Persists every row and returns the updated containers (still in the same order) so callers
 * (e.g. `computeReorderKey`'s collision path) can look up a moved page's new neighbours without
 * a second fetch. Using the same comparator as the listing endpoints ensures a legacy row with
 * `sortOrder: null` keeps its "last" position (and receives the largest new key) instead of
 * jumping to the top the way a naive `sortOrder asc` query would (both SQLite and MySQL order
 * `NULL` as the smallest value in `ASC`).
 */
export async function rebalanceSiblingGroup(workspaceId: string, parentId: string): Promise<Container[]> {
  const containerRepository = await getContainerRepository();
  const fetchedSiblings = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId).eq('parentId', parentId)
  );
  const siblings = sortByManualOrder(fetchedSiblings);

  if (siblings.length === 0) {
    return [];
  }

  const newKeys = generateNKeysBetween(null, null, siblings.length);

  const updated: Container[] = [];
  for (const [index, sibling] of siblings.entries()) {
    const newKey = newKeys[index];
    if (!sibling || newKey === undefined) {
      continue;
    }
    updated.push(
      await containerRepository.update({
        ...sibling,
        sortOrder: newKey,
      })
    );
  }

  return updated;
}
