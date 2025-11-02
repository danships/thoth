import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import type { GetPagesTreeQueryVariables, GetPagesTreeResponse, Page, DataView } from '@/types/api';
import { getPagesTreeQueryVariablesSchema } from '@/types/api';

export const GET = apiRoute<GetPagesTreeResponse, GetPagesTreeQueryVariables, {}>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
  },
  async ({ query }, session) => {
    const containerRepository = await getContainerRepository();
    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id)
      .eq('type', 'page')
      .sort('lastUpdated', 'desc');

    if (query?.parentId) {
      databaseQuery.eq('parentId', query.parentId);
    }

    // TODO: SuperSave does not return any result if we set parentId to null
    // eslint-disable-next-line unicorn/no-await-expression-member
    const containers = (await containerRepository.getByQuery(databaseQuery)).filter(
      (container) => query?.parentId || !container.parentId
    );

    // Separate containers that have views from those that don't
    const containersWithViews = containers.filter(
      (container) => container.type === 'page' && 'views' in container && container.views && container.views.length > 0
    );
    const containersWithoutViews = containers.filter((container) => !containersWithViews.includes(container));

    const parentIds = containersWithoutViews.map((container) => container.id).filter(Boolean);

    // Query for child pages only for containers without views
    const databaseChildren =
      parentIds.length > 0
        ? await containerRepository.getByQuery(
            addUserIdToQuery(containerRepository.createQuery(), session.user.id).in('parentId', parentIds)
          )
        : [];

    // Fetch views for containers that have them
    const dataViewRepository = await getDataViewRepository();
    const allViewIds = containersWithViews.flatMap((container) =>
      container.type === 'page' && 'views' in container ? (container.views ?? []) : []
    );

    const viewsMap = new Map<string, Awaited<ReturnType<typeof dataViewRepository.getByQuery>>[number]>();
    if (allViewIds.length > 0) {
      const views = await dataViewRepository.getByQuery(
        addUserIdToQuery(dataViewRepository.createQuery(), session.user.id).in('id', allViewIds)
      );
      for (const view of views) {
        viewsMap.set(view.id, view);
      }
    }

    return {
      branches: containers.map((container) => {
        const hasViews =
          container.type === 'page' && 'views' in container && container.views && container.views.length > 0;

        // Children always contains only pages
        const children: Array<{ page: Page }> = databaseChildren
          .filter((child) => child.parentId === container.id)
          .map((child): { page: Page } => ({
            page: {
              id: child.id,
              name: child.name,
              emoji: 'emoji' in child ? child.emoji || null : null,
              lastUpdated: child.lastUpdated,
              createdAt: child.createdAt,
              parentId: child.parentId || null,
            },
          }));

        // Views are in a separate field
        let views: DataView[] = [];
        if (hasViews && 'views' in container) {
          const containerViewIds = container.views ?? [];
          views = containerViewIds
            .map((viewId) => viewsMap.get(viewId))
            .filter((view): view is NonNullable<typeof view> => view !== undefined)
            .map(
              (view): DataView => ({
                id: view.id,
                name: view.name,
                lastUpdated: view.lastUpdated,
                createdAt: view.createdAt,
                dataSourceId: view.dataSourceId,
              })
            );
        }

        return {
          page: {
            id: container.id,
            name: container.name,
            emoji: 'emoji' in container ? container.emoji || null : null,
            lastUpdated: container.lastUpdated,
            createdAt: container.createdAt,
            parentId: container.parentId || null,
          },
          children,
          views,
        };
      }),
    };
  }
);
