import { apiRoute } from '@/lib/api/route-wrapper';
import { getAppRepository } from '@/lib/database';
import { removeScopedContainer } from '@/lib/database/app-scope-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { DisconnectPageAppParameters } from '@/types/api';
import { disconnectPageAppParametersSchema } from '@/types/api';

export const DELETE = apiRoute<void, {}, DisconnectPageAppParameters, {}>(
  {
    disallowApiKey: true,
    expectedParamsSchema: disconnectPageAppParametersSchema,
  },
  async ({ params }, session) => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    const appRepository = await getAppRepository();
    const app = await appRepository.getOneByQuery(appRepository.createQuery().eq('id', params.appId));

    if (!app || app.workspaceId !== page.workspaceId) {
      throw new NotFoundError('App not found');
    }

    await removeScopedContainer(app.id, page.id);
  }
);
