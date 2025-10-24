import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import {
  GetPageBlocksParameters,
  getPageBlocksParametersSchema,
  GetPageBlocksResponse,
} from '@/types/api/endpoints/get-page-blocks';
import { setPageBlocksBodySchema, setPageBlocksParametersSchema } from '@/types/api/endpoints/set-page-blocks';

export const GET = apiRoute<GetPageBlocksResponse, undefined, GetPageBlocksParameters>(
  {
    expectedParamsSchema: getPageBlocksParametersSchema,
  },
  async ({ params }, session): Promise<GetPageBlocksResponse> => {
    const containerRepository = await getContainerRepository();

    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id).eq('id', params.id);

    const page = await containerRepository.getOneByQuery(databaseQuery);

    if (!page) {
      throw new NotFoundError('Page not found', true);
    }

    return {
      blocks: page.blocks ?? [],
    };
  }
);

export const POST = apiRoute(
  {
    expectedBodySchema: setPageBlocksBodySchema,
    expectedParamsSchema: setPageBlocksParametersSchema,
  },
  async ({ params, body }, session) => {
    const containerRepository = await getContainerRepository();

    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id).eq('id', params.id);

    const page = await containerRepository.getOneByQuery(databaseQuery);

    if (!page) {
      throw new NotFoundError('Page not found', true);
    }

    const updatedPage = { ...page, blocks: body.blocks };
    await containerRepository.update(updatedPage);
  }
);
