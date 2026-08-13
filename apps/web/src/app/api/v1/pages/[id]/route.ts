import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository, getContainerRepository, getDataViewRepository } from '@/lib/database';
import { cascadeSoftDeletePage } from '@/lib/database/soft-delete-service';
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { pageColumnRetriever } from '@/lib/database/retrievers/page-column-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { getLogger } from '@/lib/logger';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import type {
  DeletePageParameters,
  GetPageDetailsParameters,
  GetPageDetailsQuery,
  GetPageDetailsResponse,
  UpdatePageBody,
  UpdatePageParameters,
  UpdatePageResponse,
} from '@/types/api';
import {
  deletePageParametersSchema,
  getPageDetailsParametersSchema,
  getPageDetailsQuerySchema,
  updatePageBodySchema,
  updatePageParametersSchema,
} from '@/types/api';

export const GET = apiRoute<GetPageDetailsResponse, GetPageDetailsQuery, GetPageDetailsParameters>(
  {
    expectedParamsSchema: getPageDetailsParametersSchema,
    expectedQuerySchema: getPageDetailsQuerySchema,
  },
  async ({ params, query }, session): Promise<GetPageDetailsResponse> => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    // fetch the linked views
    const dataViewRepository = await getDataViewRepository();
    let linkedViews: GetPageDetailsResponse['views'] = [];
    if (page.views && page.views.length > 0) {
      // Pattern C: anchored on the already-authorised page's own workspace, not creator
      // (THOTH-042).
      const fetchedViews = await dataViewRepository.getByQuery(
        addWorkspaceIdToQuery(dataViewRepository.createQuery(), page.workspaceId).in('id', page.views)
      );
      linkedViews = fetchedViews
        .filter((view) => !view.deletedAt)
        .map((view) => ({
          id: view.id,
          name: view.name,
          dataSourceId: view.dataSourceId,
          createdAt: view.createdAt,
          lastUpdated: view.lastUpdated,
          filters: view.filters,
          sorts: view.sorts,
          columns: view.columns,
          columnLayout: view.columnLayout,
        }));
    }

    // Look up the per-user starred status for this page, same lookup pattern as
    // `POST /pages/:id/access`. `false` if no ContainerAccess row exists yet. Per-user state —
    // stays scoped by userId (THOTH-042, Category B).
    const containerAccessRepository = await getContainerAccessRepository();
    const containerAccess = await containerAccessRepository.getOneByQuery(
      addUserIdToQuery(containerAccessRepository.createQuery().eq('containerId', page.id), session.user.id)
    );

    // Bounded existence check only — used purely to decide whether the "Sub Pages" tab is
    // shown, so we never fetch (or return) the full child list here. Content is scoped by
    // workspace membership + grant, not creator (THOTH-042).
    const containerRepository = await getContainerRepository();
    const childPage = await containerRepository.getOneByQuery(
      addWorkspaceIdToQuery(
        containerRepository.createQuery().eq('parentId', page.id).eq('type', 'page'),
        page.workspaceId
      )
    );

    const returnValue: GetPageDetailsResponse = {
      page: {
        id: page.id,
        name: page.name,
        emoji: page.emoji || null,
        cover: page.cover ?? null,
        lastUpdated: page.lastUpdated,
        createdAt: page.createdAt,
        parentId: page.parentId || null,
        sortOrder: page.sortOrder ?? null,
      },
      starred: containerAccess?.starred ?? false,
      hasChildren: Boolean(childPage),
    };

    if (linkedViews.length > 0) {
      returnValue.views = linkedViews;
    }

    if (query.includeContent) {
      returnValue.content = page.content ?? '';
    }
    if (query.includeValues) {
      returnValue.values = page.values ?? {};
    }

    if (query.includeColumns) {
      const columns = await pageColumnRetriever.retrieveEditableColumns(page, session.user.id);
      if (columns.length > 0) {
        returnValue.columns = columns;
      }
    }

    return returnValue;
  }
);

export const PATCH = apiRoute<UpdatePageResponse, undefined, UpdatePageParameters, UpdatePageBody>(
  {
    expectedBodySchema: updatePageBodySchema,
    expectedParamsSchema: updatePageParametersSchema,
  },
  async ({ body, params }, session) => {
    const containerRepository = await getContainerRepository();

    // Verify the page exists and is accessible; content is scoped by workspace membership +
    // grant, not creator (THOTH-042).
    const existingPage = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, existingPage, { mutating: true });

    const filteredBody: Partial<typeof existingPage> = {};
    if (body.name !== undefined) {
      filteredBody.name = body.name.trim();
    }
    if (body.emoji !== undefined) {
      filteredBody.emoji = body.emoji;
    }
    if (body.cover !== undefined) {
      filteredBody.cover = body.cover;
    }

    const updatedPage = await containerRepository.update({
      ...existingPage,
      ...filteredBody,
      lastUpdated: new Date().toISOString(),
    });

    scheduleNotifyPageChange('page.updated', updatedPage, toWebhookActor(session));

    return {
      id: updatedPage.id,
      name: updatedPage.name,
      emoji: 'emoji' in updatedPage ? updatedPage.emoji : null,
      cover: 'cover' in updatedPage ? (updatedPage.cover ?? null) : null,
      lastUpdated: updatedPage.lastUpdated,
      createdAt: updatedPage.createdAt,
      parentId: updatedPage.parentId || null,
      sortOrder: updatedPage.sortOrder ?? null,
    } satisfies UpdatePageResponse;
  }
);

export const DELETE = apiRoute<void, undefined, DeletePageParameters, {}>(
  {
    expectedParamsSchema: deletePageParametersSchema,
  },
  async ({ params }, session) => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page, { mutating: true });

    const result = await cascadeSoftDeletePage(page, session.user.id);

    const logger = await getLogger();
    logger.info('page.delete', {
      actorUserId: session.user.id,
      pageId: page.id,
      workspaceId: page.workspaceId,
      deletedPageCount: result.deletedPageCount,
      deletedViewCount: result.deletedViewCount,
    });
  }
);
