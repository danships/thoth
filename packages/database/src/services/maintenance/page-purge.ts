import { getContainerAccessRepository, getContainerRepository, getDataViewRepository } from '../../repositories.js';
import type { Container, DataView } from '../../types.js';
import { addWorkspaceIdToQuery } from '../../helpers.js';
import { isOutsideRaceSafetyMargin, isPastGraceThreshold } from './grace.js';

export type DeletedRootKind = 'container' | 'data-view';

export type DeletedRootCandidate = {
  kind: DeletedRootKind;
  id: string;
  workspaceId: string;
  deletedAt: string;
  lastUpdated: string;
};

export type PagePurgeBatch = {
  candidates: DeletedRootCandidate[];
  totalEligible: number;
};

function toCandidate(kind: DeletedRootKind, row: Container | DataView): DeletedRootCandidate | undefined {
  if (!row.deletedAt || row.deletedRootId !== row.id) {
    return undefined;
  }
  return { kind, id: row.id, workspaceId: row.workspaceId, deletedAt: row.deletedAt, lastUpdated: row.lastUpdated };
}

/**
 * Selects up to `limit` deleted roots (`Container`/`DataView` rows where `deletedRootId ===
 * id`) past `graceThresholdMs` and outside the race-safety margin, across both entity types,
 * skipping `offset` such candidates first (see `selectPurgeableWorkspaces` for the identical
 * offset/continuation contract).
 */
export async function selectPurgeableDeletedRoots(options: {
  graceThresholdMs: number;
  nowMs: number;
  limit: number;
  offset: number;
}): Promise<PagePurgeBatch> {
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();

  const allContainers = await containerRepository.getByQuery(containerRepository.createQuery());
  const allDataViews = await dataViewRepository.getByQuery(dataViewRepository.createQuery());

  const candidates: DeletedRootCandidate[] = [];
  for (const container of allContainers) {
    const candidate = toCandidate('container', container);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  for (const dataView of allDataViews) {
    const candidate = toCandidate('data-view', dataView);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const eligible = candidates.filter(
    (candidate) =>
      isPastGraceThreshold(candidate.deletedAt, options.graceThresholdMs) &&
      isOutsideRaceSafetyMargin(candidate.lastUpdated, options.nowMs)
  );

  return {
    candidates: eligible.slice(options.offset, options.offset + options.limit),
    totalEligible: eligible.length,
  };
}

export type DeletedRootPurgeOutcome =
  | { status: 'purged'; deletedContainerIds: string[]; deletedViewIds: string[] }
  | { status: 'skipped'; reason: 'restored-or-missing' };

/**
 * Revalidates a single deleted root immediately before deleting it, then permanently deletes it
 * and every cascaded (`deletedRootId === rootId`) descendant — scoped by workspace/root id only,
 * never by creator (`userId` is attribution, not an access gate — THOTH-042/THOTH-063). Mirrors
 * `permanentlyDeleteByDeletedRootId` in `apps/web/src/lib/database/soft-delete-service.ts` (the
 * interactive, per-user trash-delete path, which continues to gate its own *lookup* by the
 * acting user for the HTTP route's own authorization reasons), but this maintenance variant never
 * gates on the *content*'s creator.
 */
export async function permanentlyDeleteDeletedRoot(
  rootId: string,
  workspaceId: string,
  graceThresholdMs: number
): Promise<DeletedRootPurgeOutcome> {
  const containerRepository = await getContainerRepository();
  const containerAccessRepository = await getContainerAccessRepository();
  const dataViewRepository = await getDataViewRepository();

  const rootContainer = await containerRepository.getOneByQuery(
    addWorkspaceIdToQuery(containerRepository.createQuery().eq('id', rootId), workspaceId)
  );
  const rootDataView = rootContainer
    ? undefined
    : await dataViewRepository.getOneByQuery(
        addWorkspaceIdToQuery(dataViewRepository.createQuery().eq('id', rootId), workspaceId)
      );

  const revalidatedDeletedAt = rootContainer?.deletedAt ?? rootDataView?.deletedAt;
  const revalidatedRootId = rootContainer?.deletedRootId ?? rootDataView?.deletedRootId;
  if (!revalidatedDeletedAt || revalidatedRootId !== rootId || !isPastGraceThreshold(revalidatedDeletedAt, graceThresholdMs)) {
    // Restored, hard-deleted from under us, or no longer past the grace threshold since the
    // scan — safe no-op.
    return { status: 'skipped', reason: 'restored-or-missing' };
  }

  const cascadedContainers = rootContainer
    ? await containerRepository.getByQuery(
        addWorkspaceIdToQuery(containerRepository.createQuery().eq('deletedRootId', rootId), workspaceId)
      )
    : [];
  const cascadedDataViews = rootDataView
    ? await dataViewRepository.getByQuery(
        addWorkspaceIdToQuery(dataViewRepository.createQuery().eq('deletedRootId', rootId), workspaceId)
      )
    : [];

  // Defensively require `deletedAt` on every resolved record regardless of what matched above —
  // SuperSave has no transaction support, so a concurrent restore between the fetches above and
  // here is still (narrowly) possible; any live record found is silently skipped.
  const deletedContainerIds = [
    ...new Set(
      (rootContainer ? [rootContainer, ...cascadedContainers] : cascadedContainers)
        .filter((item) => Boolean(item.deletedAt))
        .map((item) => item.id)
    ),
  ];
  const deletedViewIds = [
    ...new Set(
      (rootDataView ? [rootDataView, ...cascadedDataViews] : cascadedDataViews)
        .filter((item) => Boolean(item.deletedAt))
        .map((item) => item.id)
    ),
  ];

  if (deletedContainerIds.length > 0) {
    const accessRows = await containerAccessRepository.getByQuery(
      containerAccessRepository.createQuery().in('containerId', deletedContainerIds)
    );
    for (const accessRow of accessRows) {
      await containerAccessRepository.deleteUsingId(accessRow.id);
    }
  }

  // Re-check `deletedAt` immediately before each delete — the closest available approximation of
  // atomicity absent DB transactions.
  const removedViewIds: string[] = [];
  for (const dataViewId of deletedViewIds) {
    const current = await dataViewRepository.getOneByQuery(dataViewRepository.createQuery().eq('id', dataViewId));
    if (!current?.deletedAt) {
      continue;
    }
    await dataViewRepository.deleteUsingId(dataViewId);
    removedViewIds.push(dataViewId);
  }

  const removedContainerIds: string[] = [];
  for (const containerId of deletedContainerIds) {
    const current = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', containerId));
    if (!current?.deletedAt) {
      continue;
    }
    await containerRepository.deleteUsingId(containerId);
    removedContainerIds.push(containerId);
  }

  return { status: 'purged', deletedContainerIds: removedContainerIds, deletedViewIds: removedViewIds };
}
