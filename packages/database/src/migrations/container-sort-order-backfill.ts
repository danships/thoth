import type { SuperSave } from 'supersave';
import { generateNKeysBetween } from 'fractional-indexing';
import * as entities from '../entities/index.js';
import type { Container } from '../types.js';

/**
 * One-time backfill for THOTH-036 (manual reordering): seeds `Container.sortOrder` for every
 * pre-existing **parented** row (`parentId !== null` — child pages and data-source rows). Root
 * rows (`parentId == null`) are skipped entirely: root-level ordering stays `lastUpdated desc`
 * and is permanently out of scope for manual ordering, so root `sortOrder` is left `null`.
 *
 * Sibling groups are keyed by `(workspaceId, parentId)`. Within each group, rows are seeded in
 * their *current* `lastUpdated desc` order (ties broken by `id asc`) — matching the pre-THOTH-036
 * default child ordering — so the post-migration manual order is identical to what users
 * currently see, with no visible reshuffle.
 *
 * Idempotent: rows that already have a `sortOrder` are left untouched, so re-running this
 * migration (or running it against a database partially seeded by a previous partial run) is
 * safe. Soft-deleted rows are included (they retain a stable `sortOrder` so a future restore
 * lands in a sensible slot), mirroring the "retain sortOrder on soft delete" edge case in the
 * spec.
 */
export async function backfillContainerSortOrder(superSave: SuperSave): Promise<void> {
  const containerRepository = superSave.getRepository<Container>(entities.CONTAINER_NAME);

  const allContainers = await containerRepository.getByQuery(containerRepository.createQuery());

  const groups = new Map<string, Container[]>();
  for (const container of allContainers) {
    if (!container.parentId) {
      // Root rows are never manually ordered — leave `sortOrder` as-is (null).
      continue;
    }
    if (container.sortOrder !== undefined && container.sortOrder !== null) {
      // Already seeded (idempotent skip) — but it still needs to be excluded from the group so
      // a mixed group (some seeded, some not, e.g. a partially-applied previous run) doesn't
      // regenerate keys for rows that already have one.
      continue;
    }

    const groupKey = `${container.workspaceId}::${container.parentId}`;
    const group = groups.get(groupKey) ?? [];
    group.push(container);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const ordered = group.toSorted((a, b) => {
      if (a.lastUpdated !== b.lastUpdated) {
        return a.lastUpdated < b.lastUpdated ? 1 : -1;
      }
      return a.id < b.id ? -1 : 1;
    });

    const keys = generateNKeysBetween(null, null, ordered.length);

    for (const [index, container] of ordered.entries()) {
      const key = keys[index];
      if (!container || key === undefined) {
        continue;
      }
      await containerRepository.update({
        ...container,
        sortOrder: key,
      });
    }
  }
}
