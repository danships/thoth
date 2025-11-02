import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
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
    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    return {
      blocks: 'blocks' in page ? (page.blocks ?? []) : [],
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

    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    const updatedPage = { ...page, blocks: body.blocks };
    await containerRepository.update(updatedPage);
  }
);
