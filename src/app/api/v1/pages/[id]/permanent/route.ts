import { apiRoute } from '@/lib/api/route-wrapper';
import { permanentlyDeleteByDeletedRootId } from '@/lib/database/soft-delete-service';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getLogger } from '@/lib/logger';
import type { PermanentDeletePageParameters } from '@/types/api';
import { permanentDeletePageParametersSchema } from '@/types/api';

export const DELETE = apiRoute<void, undefined, PermanentDeletePageParameters, {}>(
  {
    expectedParamsSchema: permanentDeletePageParametersSchema,
    disallowApiKey: true,
  },
  async ({ params }, session) => {
    const page = await pageRetriever.retrievePageIncludingDeleted(params.id, session.user.id);
    if (!page.deletedAt || page.deletedRootId !== page.id) {
      throw new NotFoundError('Page not found');
    }

    await permanentlyDeleteByDeletedRootId(page.id, session.user.id, page.workspaceId);

    const logger = await getLogger();
    logger.info('page.purge', {
      actorUserId: session.user.id,
      pageId: page.id,
      workspaceId: page.workspaceId,
    });
  }
);
