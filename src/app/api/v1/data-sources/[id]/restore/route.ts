import { apiRoute } from '@/lib/api/route-wrapper';
import { getPageDeleteGracePeriodDays, isPageDeleteGracePeriodExpired } from '@/lib/database/page-grace-period';
import { restoreByDeletedRootId } from '@/lib/database/soft-delete-service';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { HttpError } from '@/lib/errors/http-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getLogger } from '@/lib/logger';
import type { RestoreDataSourceParameters, RestoreDataSourceResponse } from '@/types/api';
import { restoreDataSourceParametersSchema } from '@/types/api';

export const POST = apiRoute<RestoreDataSourceResponse, undefined, RestoreDataSourceParameters, {}>(
  {
    expectedParamsSchema: restoreDataSourceParametersSchema,
  },
  async ({ params }, session) => {
    const dataSource = await dataSourceRetriever.retrieveDataSourceIncludingDeleted(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource);

    if (!dataSource.deletedAt || dataSource.deletedRootId !== dataSource.id) {
      throw new NotFoundError('Data source not found');
    }

    const gracePeriodDays = await getPageDeleteGracePeriodDays();
    if (isPageDeleteGracePeriodExpired(dataSource.deletedAt, gracePeriodDays)) {
      throw new HttpError('Grace period has expired for this data source', 410, true);
    }

    await restoreByDeletedRootId(dataSource.id, session.user.id, dataSource.workspaceId);
    const restored = await dataSourceRetriever.retrieveDataSource(dataSource.id, session.user.id);

    const logger = await getLogger();
    logger.info('data-source.restore', {
      actorUserId: session.user.id,
      dataSourceId: restored.id,
      workspaceId: restored.workspaceId,
    });

    return {
      id: restored.id,
      name: restored.name,
      createdAt: restored.createdAt,
      lastUpdated: restored.lastUpdated,
      columns: restored.columns ?? [],
    };
  }
);
