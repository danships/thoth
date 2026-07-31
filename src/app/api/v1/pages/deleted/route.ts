import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { getPageDeleteGracePeriodDays } from '@/lib/database/page-grace-period';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import type { GetDeletedPagesQuery, GetDeletedPagesResponse } from '@/types/api';
import { getDeletedPagesQuerySchema } from '@/types/api';

export const GET = apiRoute<GetDeletedPagesResponse, GetDeletedPagesQuery, {}, {}>(
  {
    expectedQuerySchema: getDeletedPagesQuerySchema,
    disallowApiKey: true,
  },
  async ({ query }, session) => {
    const workspaceId = query.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
    await assertWorkspaceAccess(session.user.id, workspaceId);

    const containerRepository = await getContainerRepository();
    const dataViewRepository = await getDataViewRepository();
    const gracePeriodDays = await getPageDeleteGracePeriodDays();
    const now = Date.now();

    const containers = await containerRepository.getByQuery(
      addWorkspaceIdToQuery(addUserIdToQuery(containerRepository.createQuery(), session.user.id), workspaceId)
    );
    const dataViews = await dataViewRepository.getByQuery(
      addWorkspaceIdToQuery(addUserIdToQuery(dataViewRepository.createQuery(), session.user.id), workspaceId)
    );

    return [
      ...containers
        .filter((container) => container.deletedAt && container.deletedRootId === container.id)
        .map((container) => ({
          id: container.id,
          name: container.name,
          type: container.type,
          deletedAt: container.deletedAt as string,
          daysRemaining: Math.max(
            0,
            Math.ceil(
              (Date.parse(container.deletedAt as string) + gracePeriodDays * 24 * 60 * 60 * 1000 - now) /
                (24 * 60 * 60 * 1000)
            )
          ),
        })),
      ...dataViews
        .filter((dataView) => dataView.deletedAt && dataView.deletedRootId === dataView.id)
        .map((dataView) => ({
          id: dataView.id,
          name: dataView.name,
          type: 'data-view' as const,
          deletedAt: dataView.deletedAt as string,
          daysRemaining: Math.max(
            0,
            Math.ceil(
              (Date.parse(dataView.deletedAt as string) + gracePeriodDays * 24 * 60 * 60 * 1000 - now) /
                (24 * 60 * 60 * 1000)
            )
          ),
        })),
    ]
      .filter((item) => item.daysRemaining > 0)
      .toSorted((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  }
);
