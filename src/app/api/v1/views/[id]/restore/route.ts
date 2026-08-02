import { apiRoute } from '@/lib/api/route-wrapper';
import { getPageDeleteGracePeriodDays } from '@/lib/database/page-grace-period';
import { restoreByDeletedRootId } from '@/lib/database/soft-delete-service';
import { dataViewRetriever } from '@/lib/database/retrievers/data-view-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { HttpError } from '@/lib/errors/http-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getLogger } from '@/lib/logger';
import type { RestoreViewParameters, RestoreViewResponse } from '@/types/api';
import { restoreViewParametersSchema } from '@/types/api';

export const POST = apiRoute<RestoreViewResponse, undefined, RestoreViewParameters, {}>(
  {
    expectedParamsSchema: restoreViewParametersSchema,
  },
  async ({ params }, session) => {
    const dataView = await dataViewRetriever.retrieveDataViewIncludingDeleted(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataView, { mutating: true });

    if (!dataView.deletedAt || dataView.deletedRootId !== dataView.id) {
      throw new NotFoundError('Data view not found');
    }

    const gracePeriodDays = await getPageDeleteGracePeriodDays();
    const deletedAtMs = Date.parse(dataView.deletedAt);
    const graceThresholdMs = Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000;
    if (Number.isNaN(deletedAtMs) || deletedAtMs <= graceThresholdMs) {
      throw new HttpError('Grace period has expired for this data view', 410, true);
    }

    await restoreByDeletedRootId(dataView.id, session.user.id, dataView.workspaceId);
    const restored = await dataViewRetriever.retrieveDataView(dataView.id, session.user.id);

    const logger = await getLogger();
    logger.info('view.restore', {
      actorUserId: session.user.id,
      viewId: restored.id,
      workspaceId: restored.workspaceId,
    });

    return {
      id: restored.id,
      name: restored.name,
      dataSourceId: restored.dataSourceId,
      createdAt: restored.createdAt,
      lastUpdated: restored.lastUpdated,
      filters: restored.filters,
      sorts: restored.sorts,
    };
  }
);
