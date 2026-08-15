import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { dataViewRetriever } from '@/lib/database/retrievers/data-view-retriever';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getLogger } from '@/lib/logger';
import type { DuplicateViewBody, DuplicateViewParameters, DuplicateViewResponse } from '@/types/api';
import { duplicateViewBodySchema, duplicateViewParametersSchema } from '@/types/api';
import type { PageContainer } from '@thoth/database/types';

export const POST = apiRoute<DuplicateViewResponse, undefined, DuplicateViewParameters, DuplicateViewBody>(
  {
    expectedBodySchema: duplicateViewBodySchema,
    expectedParamsSchema: duplicateViewParametersSchema,
  },
  async ({ params, body }, session) => {
    const sourceView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, sourceView);

    const hostPage = await pageRetriever.retrievePage(body.pageId, session.user.id);
    if (hostPage.workspaceId !== sourceView.workspaceId) {
      throw new NotFoundError('Page not found or access denied.');
    }
    if (!(hostPage.views ?? []).includes(sourceView.id)) {
      throw new NotFoundError('View is not linked to this page.');
    }
    await assertGrantAllowsContainerForSession(session, hostPage, { mutating: true });

    const dataViewRepository = await getDataViewRepository();
    const now = new Date().toISOString();
    const createdView = await dataViewRepository.create({
      name: `${sourceView.name} (copy)`,
      dataSourceId: sourceView.dataSourceId,
      workspaceId: sourceView.workspaceId,
      userId: session.user.id,
      createdAt: now,
      lastUpdated: now,
      // Deep-cloned so the copy never shares array/object references with the source —
      // structuredClone is available in the Node runtime this app already targets.
      columns: structuredClone(sourceView.columns ?? []),
      filters: structuredClone(sourceView.filters ?? []),
      sorts: structuredClone(sourceView.sorts ?? []),
      columnLayout: sourceView.columnLayout ? structuredClone(sourceView.columnLayout) : null,
      deletedAt: null,
      deletedRootId: null,
    });

    // Appended to the end of the page's views, exactly like POST /views does for a newly
    // created view — there is no positional/ordering column to insert "after" the source at.
    const containerRepository = await getContainerRepository();
    await containerRepository.update({
      ...hostPage,
      views: [...(hostPage.views ?? []), createdView.id],
    } satisfies PageContainer);

    const logger = await getLogger();
    logger.info('view.duplicate', {
      actorUserId: session.user.id,
      sourceViewId: sourceView.id,
      viewId: createdView.id,
      workspaceId: createdView.workspaceId,
      pageId: hostPage.id,
    });

    return {
      id: createdView.id,
      name: createdView.name,
      dataSourceId: createdView.dataSourceId,
      createdAt: createdView.createdAt,
      lastUpdated: createdView.lastUpdated,
      filters: createdView.filters,
      sorts: createdView.sorts,
      columns: createdView.columns,
      columnLayout: createdView.columnLayout,
    } satisfies DuplicateViewResponse;
  }
);
