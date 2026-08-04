import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { getContainerRepository } from '.';
import { addWorkspaceIdToQuery } from './helpers';
import type { Container } from '@/types/database';

/**
 * Returns the lexicographically-largest `sortOrder` key currently in use within a sibling
 * group (`workspaceId` + `parentId`), or `null` if the group is empty. Used to mint an
 * end-of-list key for newly created pages (`generateKeyBetween(max, null)`), and as the shared
 * "max sibling key" helper reused by both `POST /pages` and the reorder rebalance path
 * (THOTH-036).
 */
export async function getMaxSiblingSortOrder(workspaceId: string, parentId: string): Promise<string | null> {
  const containerRepository = await getContainerRepository();
  const lastSibling = await containerRepository.getOneByQuery(
    addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId)
      .eq('parentId', parentId)
      .sort('sortOrder', 'desc')
      .limit(1)
  );

  return lastSibling?.sortOrder ?? null;
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
 * group's current `sortOrder asc, id asc` order — i.e. it preserves the existing relative order,
 * it just regains spacing between keys. Persists every row and returns the updated containers
 * (still in the same order) so callers (e.g. `computeReorderKey`'s collision path) can look up
 * a moved page's new neighbours without a second fetch.
 */
export async function rebalanceSiblingGroup(workspaceId: string, parentId: string): Promise<Container[]> {
  const containerRepository = await getContainerRepository();
  const siblings = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId)
      .eq('parentId', parentId)
      .sort('sortOrder', 'asc')
      .sort('id', 'asc')
  );

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
