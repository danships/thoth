import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import type { GetPageDetailsParameters, GetPageDetailsResponse } from '@/types/api';
import { getPageDetailsParametersSchema } from '@/types/api';

export const GET = apiRoute<GetPageDetailsResponse, undefined, GetPageDetailsParameters>(
  {
    expectedParamsSchema: getPageDetailsParametersSchema,
  },
  async ({ params }, session): Promise<GetPageDetailsResponse> => {
    const containerRepository = await getContainerRepository();

    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id).eq('id', params?.id);

    const page = await containerRepository.getOneByQuery(databaseQuery);

    if (!page) {
      throw new Error('Page not found');
    }

    return {
      page: {
        id: page.id,
        name: page.name,
        emoji: page.emoji || null,
        type: page.type as 'page',
        lastUpdated: page.lastUpdated,
        createdAt: page.createdAt,
        parentId: page.parentId || null,
      },
    };
  }
);
