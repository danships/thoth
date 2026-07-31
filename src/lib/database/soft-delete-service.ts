import { getContainerAccessRepository, getContainerRepository, getDataViewRepository } from './index';
import { getPageDeleteGracePeriodDays } from './page-grace-period';
import { addUserIdToQuery, addWorkspaceIdToQuery } from './helpers';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { Container, PageContainer } from '@/types/database';

const MAX_DESCENDANT_DEPTH = 50;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

function isGracePeriodExpired(deletedAt: string, gracePeriodDays: number): boolean {
  const deletedAtMs = Date.parse(deletedAt);
  const graceThresholdMs = Date.now() - gracePeriodDays * DAY_IN_MS;
  return Number.isNaN(deletedAtMs) || deletedAtMs <= graceThresholdMs;
}

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

  const deletedContainerIds = [
    ...new Set((rootContainer ? [rootContainer, ...cascadedContainers] : cascadedContainers).map((item) => item.id)),
  ];
  const deletedViewIds = [
    ...new Set((rootDataView ? [rootDataView, ...cascadedDataViews] : cascadedDataViews).map((item) => item.id)),
  ];

  if (deletedContainerIds.length > 0) {
    const accessRows = await containerAccessRepository.getByQuery(
      containerAccessRepository.createQuery().in('containerId', deletedContainerIds)
    );
    for (const accessRow of accessRows) {
      await containerAccessRepository.deleteUsingId(accessRow.id);
    }
  }

  for (const dataViewId of deletedViewIds) {
    await dataViewRepository.deleteUsingId(dataViewId);
  }

  for (const containerId of deletedContainerIds) {
    await containerRepository.deleteUsingId(containerId);
  }

  return { deletedContainerIds, deletedViewIds };
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
      if (isGracePeriodExpired(root.deletedAt, gracePeriodDays)) {
        throw new Error('Grace period has expired');
      }

      await restoreByDeletedRootId(root.id, userId, root.workspaceId);
      restored.push(id);
    } catch (error) {
      failed.push({ id, reason: error instanceof Error ? error.message : 'Failed to restore item' });
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
      failed.push({ id, reason: error instanceof Error ? error.message : 'Failed to permanently delete item' });
    }
  }

  return { deleted, failed };
}
