import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { GetPageDetailsParameters, GetPageDetailsResponse } from '@/types/api';
import { getPageDetailsParametersSchema } from '@/types/api';

export const GET = apiRoute<GetPageDetailsResponse, undefined, GetPageDetailsParameters>(
  {
    expectedParamsSchema: getPageDetailsParametersSchema,
  },
  async ({ params }, session): Promise<GetPageDetailsResponse> => {
    const containerRepository = await getContainerRepository();

    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id).eq('id', params.id);

    const page = await containerRepository.getOneByQuery(databaseQuery);

    if (!page) {
      throw new NotFoundError('Page not found', true);
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
