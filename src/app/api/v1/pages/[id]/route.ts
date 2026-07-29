import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository, getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { pageColumnRetriever } from '@/lib/database/retrievers/page-column-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import type {
  GetPageDetailsParameters,
  GetPageDetailsQuery,
  GetPageDetailsResponse,
  UpdatePageBody,
  UpdatePageParameters,
  UpdatePageResponse,
} from '@/types/api';
import {
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
      linkedViews = await dataViewRepository.getByQuery(
        addUserIdToQuery(dataViewRepository.createQuery(), session.user.id)
          .in('id', page.views)
          .eq('workspaceId', page.workspaceId)
      );
    }

    // Look up the per-user starred status for this page, same lookup pattern as
    // `POST /pages/:id/access`. `false` if no ContainerAccess row exists yet.
    const containerAccessRepository = await getContainerAccessRepository();
    const containerAccess = await containerAccessRepository.getOneByQuery(
      addUserIdToQuery(containerAccessRepository.createQuery().eq('containerId', page.id), session.user.id)
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
      },
      starred: containerAccess?.starred ?? false,
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

    // Verify the page exists and belongs to the user
    const existingPage = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, existingPage);

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

    return {
      id: updatedPage.id,
      name: updatedPage.name,
      emoji: 'emoji' in updatedPage ? updatedPage.emoji : null,
      cover: 'cover' in updatedPage ? (updatedPage.cover ?? null) : null,
      lastUpdated: updatedPage.lastUpdated,
      createdAt: updatedPage.createdAt,
      parentId: updatedPage.parentId || null,
    } satisfies UpdatePageResponse;
  }
);
