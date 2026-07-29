import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import {
  GetPageContentParameters,
  getPageContentParametersSchema,
  GetPageContentResponse,
} from '@/types/api/endpoints/get-page-content';
import { setPageContentBodySchema, setPageContentParametersSchema } from '@/types/api/endpoints/set-page-content';

export const GET = apiRoute<GetPageContentResponse, undefined, GetPageContentParameters>(
  {
    expectedParamsSchema: getPageContentParametersSchema,
  },
  async ({ params }, session): Promise<GetPageContentResponse> => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    return {
      content: 'content' in page ? (page.content ?? '') : '',
    };
  }
);

export const POST = apiRoute(
  {
    expectedBodySchema: setPageContentBodySchema,
    expectedParamsSchema: setPageContentParametersSchema,
  },
  async ({ params, body }, session) => {
    const containerRepository = await getContainerRepository();

    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    await containerRepository.update({ ...page, content: body.content, lastUpdated: new Date().toISOString() });
  }
);
