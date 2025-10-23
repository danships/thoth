import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import type { GetPagesTreeQueryVariables, GetPagesTreeResponse } from '@/types/api';
import { getPagesTreeQueryVariablesSchema } from '@/types/api';

export const GET = apiRoute<GetPagesTreeResponse, GetPagesTreeQueryVariables, {}>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
  },
  async ({ query }, session) => {
    const containerRepository = await getContainerRepository();
    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id).sort(
      'lastUpdated',
      'desc'
    );

    if (query?.parentId) {
      databaseQuery.eq('parentId', query.parentId);
    }

    // TODO: SuperSave does not return any result if we set parentId to null
    // eslint-disable-next-line unicorn/no-await-expression-member
    const containers = (await containerRepository.getByQuery(databaseQuery)).filter(
      (container) => query?.parentId || !container.parentId
    );

    const parentIds = containers.map((container) => container.id).filter(Boolean);

    const databaseChildren =
      parentIds.length > 0
        ? await containerRepository.getByQuery(
            addUserIdToQuery(containerRepository.createQuery(), session.user.id).in('parentId', parentIds)
          )
        : [];

    return {
      branches: containers.map((container) => ({
        page: {
          id: container.id,
          name: container.name,
          emoji: container.emoji || null,
          type: container.type as 'page',
          lastUpdated: container.lastUpdated,
          createdAt: container.createdAt,
          parentId: container.parentId || null,
        },
        children: databaseChildren
          .filter((child) => child.parentId === container.id)
          .map((child) => ({
            page: {
              id: child.id,
              name: child.name,
              emoji: child.emoji || null,
              type: child.type as 'page',
              lastUpdated: child.lastUpdated,
              createdAt: child.createdAt,
              parentId: child.parentId || null,
            },
          })),
      })),
    };
  }
);
