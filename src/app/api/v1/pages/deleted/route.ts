import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { getPageDeleteGracePeriodDays } from '@/lib/database/page-grace-period';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import type { GetDeletedPagesQuery, GetDeletedPagesResponse } from '@/types/api';
import { getDeletedPagesQuerySchema } from '@/types/api';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// Whole days left in the grace period for an item deleted at `deletedAt`, clamped to zero once
// expired. Shared by both the container and data-view mappings below so the calculation is
// defined in exactly one place.
function calculateDaysRemaining(deletedAt: string, gracePeriodDays: number, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(deletedAt) + gracePeriodDays * DAY_IN_MS - now) / DAY_IN_MS));
}

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

    // The SuperSave query builder only supports `eq`/`in`/`sort` predicates (no "not null" or
    // column-to-column comparison), so soft-deleted trash roots can't be filtered at the
    // database level here — every workspace row is fetched and the deleted-root filtering is
    // done in application code below.
    const containers = await containerRepository.getByQuery(
      addWorkspaceIdToQuery(addUserIdToQuery(containerRepository.createQuery(), session.user.id), workspaceId)
    );
    const dataViews = await dataViewRepository.getByQuery(
      addWorkspaceIdToQuery(addUserIdToQuery(dataViewRepository.createQuery(), session.user.id), workspaceId)
    );

    return [
      ...containers
        .filter((container) => container.deletedAt && container.deletedRootId === container.id)
        .map((container) => {
          const deletedAt: string = container.deletedAt as string;
          return {
            id: container.id,
            name: container.name,
            type: container.type,
            deletedAt,
            daysRemaining: calculateDaysRemaining(deletedAt, gracePeriodDays, now),
          };
        }),
      ...dataViews
        .filter((dataView) => dataView.deletedAt && dataView.deletedRootId === dataView.id)
        .map((dataView) => {
          const deletedAt: string = dataView.deletedAt as string;
          return {
            id: dataView.id,
            name: dataView.name,
            type: 'data-view' as const,
            deletedAt,
            daysRemaining: calculateDaysRemaining(deletedAt, gracePeriodDays, now),
          };
        }),
    ]
      .filter((item) => item.daysRemaining > 0)
      .toSorted((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  }
);
