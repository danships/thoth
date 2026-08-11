import { getContainerAccessRepository, getContainerRepository, getDataViewRepository } from './index';
import { getPageDeleteGracePeriodDays, isPageDeleteGracePeriodExpired } from './page-grace-period';
import { addUserIdToQuery, addWorkspaceIdToQuery } from './helpers';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getLogger } from '@/lib/logger';
import type { Container, PageContainer } from '@thoth/database/types';

const MAX_DESCENDANT_DEPTH = 50;

type TrashRoot = {
  id: string;
  workspaceId: string;
  deletedAt: string;
  type: 'page' | 'data-source' | 'data-view';
};

type BatchFailure = {
  id: string;
  reason: string;
};

// Generic, user-facing failure messages for batch operations — never surface a raw
// `error.message` from the repository/driver layer, which can leak internal details.
const RESTORE_GENERIC_FAILURE_REASON = 'Failed to restore item';
const RESTORE_GRACE_PERIOD_EXPIRED_REASON = 'Grace period has expired';
const PERMANENT_DELETE_GENERIC_FAILURE_REASON = 'Failed to permanently delete item';

class GracePeriodExpiredError extends Error {}

async function resolveTrashRootForUser(id: string, userId: string): Promise<TrashRoot> {
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();

  const container = await containerRepository.getOneByQuery(
    addUserIdToQuery(containerRepository.createQuery().eq('id', id), userId)
  );

  if (container) {
    await assertWorkspaceAccess(userId, container.workspaceId);
    if (!container.deletedAt || container.deletedRootId !== container.id) {
      throw new NotFoundError(container.type === 'page' ? 'Page not found' : 'Data source not found');
    }

    return {
      id: container.id,
      workspaceId: container.workspaceId,
      deletedAt: container.deletedAt,
      type: container.type,
    };
  }

  const dataView = await dataViewRepository.getOneByQuery(
    addUserIdToQuery(dataViewRepository.createQuery().eq('id', id), userId)
  );
  if (!dataView) {
    throw new NotFoundError('Deleted item not found');
  }

  await assertWorkspaceAccess(userId, dataView.workspaceId);
  if (!dataView.deletedAt || dataView.deletedRootId !== dataView.id) {
    throw new NotFoundError('Data view not found');
  }

  return {
    id: dataView.id,
    workspaceId: dataView.workspaceId,
    deletedAt: dataView.deletedAt,
    type: 'data-view',
  };
}

export async function collectDescendantPageIds(rootPageId: string, workspaceId: string): Promise<string[]> {
  const containerRepository = await getContainerRepository();
  const descendantIds: string[] = [];
  const seen = new Set<string>([rootPageId]);
  let frontier = [rootPageId];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_DESCENDANT_DEPTH) {
    depth += 1;

    const batch = await containerRepository.getByQuery(
      addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId).eq('type', 'page').in('parentId', frontier)
    );

    const nextFrontier: string[] = [];
    for (const container of batch) {
      if (container.type !== 'page' || seen.has(container.id)) {
        continue;
      }

      seen.add(container.id);
      descendantIds.push(container.id);
      nextFrontier.push(container.id);
    }

    frontier = nextFrontier;
  }

  if (frontier.length > 0 && depth >= MAX_DESCENDANT_DEPTH) {
    const logger = await getLogger();
    logger.warn('soft-delete.descendant-collection-truncated', {
      rootPageId,
      workspaceId,
      maxDepth: MAX_DESCENDANT_DEPTH,
      remainingFrontierSize: frontier.length,
    });
  }

  return descendantIds;
}

export async function cascadeSoftDeletePage(
  page: PageContainer,
  userId: string
): Promise<{ deletedPageCount: number; deletedViewCount: number }> {
  const now = new Date().toISOString();
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();

  const descendantIds = await collectDescendantPageIds(page.id, page.workspaceId);
  const descendants =
    descendantIds.length > 0
      ? await containerRepository.getByQuery(
          addWorkspaceIdToQuery(addUserIdToQuery(containerRepository.createQuery(), userId), page.workspaceId)
            .eq('type', 'page')
            .in('id', descendantIds)
        )
      : [];

  await containerRepository.update({
    ...page,
    deletedAt: now,
    deletedRootId: page.id,
    lastUpdated: now,
  });

  let deletedPageCount = 1;
  for (const descendant of descendants) {
    if (descendant.type !== 'page' || descendant.deletedAt) {
      continue;
    }

    await containerRepository.update({
      ...descendant,
      deletedAt: now,
      deletedRootId: page.id,
      lastUpdated: now,
    });
    deletedPageCount += 1;
  }

  const linkedViewIds = new Set<string>(page.views);
  for (const descendant of descendants) {
    if (descendant.type !== 'page') {
      continue;
    }
    for (const viewId of descendant.views ?? []) {
      linkedViewIds.add(viewId);
    }
  }

  let deletedViewCount = 0;
  if (linkedViewIds.size > 0) {
    const linkedViews = await dataViewRepository.getByQuery(
      addWorkspaceIdToQuery(addUserIdToQuery(dataViewRepository.createQuery(), userId), page.workspaceId).in('id', [
        ...linkedViewIds,
      ])
    );

    for (const view of linkedViews) {
      if (view.deletedAt) {
        continue;
      }

      await dataViewRepository.update({
        ...view,
        deletedAt: now,
        deletedRootId: page.id,
        lastUpdated: now,
      });
      deletedViewCount += 1;
    }
  }

  return { deletedPageCount, deletedViewCount };
}

export async function restoreByDeletedRootId(
  rootId: string,
  userId: string,
  workspaceId: string
): Promise<{ restoredContainerIds: string[]; restoredViewIds: string[] }> {
  const now = new Date().toISOString();
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();

  const rootContainer = await containerRepository.getOneByQuery(
    addWorkspaceIdToQuery(addUserIdToQuery(containerRepository.createQuery().eq('id', rootId), userId), workspaceId)
  );
  const cascadedContainers = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('deletedRootId', rootId), userId),
      workspaceId
    )
  );

  const rootDataView = await dataViewRepository.getOneByQuery(
    addWorkspaceIdToQuery(addUserIdToQuery(dataViewRepository.createQuery().eq('id', rootId), userId), workspaceId)
  );
  const cascadedDataViews = await dataViewRepository.getByQuery(
    addWorkspaceIdToQuery(
      addUserIdToQuery(dataViewRepository.createQuery().eq('deletedRootId', rootId), userId),
      workspaceId
    )
  );

  const restoredContainerIds = new Set<string>();
  for (const container of rootContainer ? [rootContainer, ...cascadedContainers] : cascadedContainers) {
    if (restoredContainerIds.has(container.id)) {
      continue;
    }

    let parentId = container.parentId ?? null;
    if (container.id === rootId && container.type === 'page' && parentId) {
      const parent = await containerRepository.getOneByQuery(
        addWorkspaceIdToQuery(
          addUserIdToQuery(containerRepository.createQuery().eq('id', parentId), userId),
          workspaceId
        )
      );
      if (parent?.deletedAt) {
        parentId = null;
      }
    }

    await containerRepository.update({
      ...container,
      parentId,
      deletedAt: null,
      deletedRootId: null,
      lastUpdated: now,
    } satisfies Container);
    restoredContainerIds.add(container.id);
  }

  const restoredViewIds = new Set<string>();
  for (const dataView of rootDataView ? [rootDataView, ...cascadedDataViews] : cascadedDataViews) {
    if (restoredViewIds.has(dataView.id)) {
      continue;
    }

    await dataViewRepository.update({
      ...dataView,
      deletedAt: null,
      deletedRootId: null,
      lastUpdated: now,
    });
    restoredViewIds.add(dataView.id);
  }

  return {
    restoredContainerIds: [...restoredContainerIds],
    restoredViewIds: [...restoredViewIds],
  };
}

export async function permanentlyDeleteByDeletedRootId(
  rootId: string,
  userId: string,
  workspaceId: string
): Promise<{ deletedContainerIds: string[]; deletedViewIds: string[] }> {
  const containerRepository = await getContainerRepository();
  const containerAccessRepository = await getContainerAccessRepository();
  const dataViewRepository = await getDataViewRepository();

  const rootContainer = await containerRepository.getOneByQuery(
    addWorkspaceIdToQuery(addUserIdToQuery(containerRepository.createQuery().eq('id', rootId), userId), workspaceId)
  );
  const cascadedContainers = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('deletedRootId', rootId), userId),
      workspaceId
    )
  );

  const rootDataView = await dataViewRepository.getOneByQuery(
    addWorkspaceIdToQuery(addUserIdToQuery(dataViewRepository.createQuery().eq('id', rootId), userId), workspaceId)
  );
  const cascadedDataViews = await dataViewRepository.getByQuery(
    addWorkspaceIdToQuery(
      addUserIdToQuery(dataViewRepository.createQuery().eq('deletedRootId', rootId), userId),
      workspaceId
    )
  );

  // Defensively require `deletedAt` on every resolved record regardless of what the caller's
  // query conditions matched — a container/view could have been restored (its `deletedAt`
  // cleared) between the caller's own validation and this fetch, and SuperSave has no
  // transaction support to prevent that interleaving. Any live record found here is silently
  // skipped rather than deleted.
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

  // Re-check `deletedAt` immediately before each delete to narrow (though, absent DB
  // transactions, not fully close) the window in which a concurrent restore could otherwise
  // cause a now-live record to be permanently deleted. Only records actually removed are
  // reported back to the caller.
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

  return { deletedContainerIds: removedContainerIds, deletedViewIds: removedViewIds };
}

// Maps a caught error to a safe, user-facing reason string for batch restore/delete results.
// Only errors we deliberately throw with curated messages (`NotFoundError`,
// `GracePeriodExpiredError`) are surfaced as-is; anything else (repository/driver errors, etc.)
// falls back to a fixed generic message so internal details are never leaked to the client.
function toSafeBatchFailureReason(error: unknown, genericReason: string): string {
  if (error instanceof NotFoundError || error instanceof GracePeriodExpiredError) {
    return error.message;
  }
  return genericReason;
}

export async function restoreManyByIds(
  ids: string[],
  userId: string
): Promise<{ restored: string[]; failed: BatchFailure[] }> {
  const restored: string[] = [];
  const failed: BatchFailure[] = [];
  const gracePeriodDays = await getPageDeleteGracePeriodDays();

  for (const id of ids) {
    try {
      const root = await resolveTrashRootForUser(id, userId);
      if (isPageDeleteGracePeriodExpired(root.deletedAt, gracePeriodDays)) {
        throw new GracePeriodExpiredError(RESTORE_GRACE_PERIOD_EXPIRED_REASON);
      }

      await restoreByDeletedRootId(root.id, userId, root.workspaceId);
      restored.push(id);
    } catch (error) {
      failed.push({ id, reason: toSafeBatchFailureReason(error, RESTORE_GENERIC_FAILURE_REASON) });
    }
  }

  return { restored, failed };
}

export async function permanentlyDeleteManyByIds(
  ids: string[],
  userId: string
): Promise<{ deleted: string[]; failed: BatchFailure[] }> {
  const deleted: string[] = [];
  const failed: BatchFailure[] = [];

  for (const id of ids) {
    try {
      const root = await resolveTrashRootForUser(id, userId);
      await permanentlyDeleteByDeletedRootId(root.id, userId, root.workspaceId);
      deleted.push(id);
    } catch (error) {
      failed.push({ id, reason: toSafeBatchFailureReason(error, PERMANENT_DELETE_GENERIC_FAILURE_REASON) });
    }
  }

  return { deleted, failed };
}
