import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
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
    const containerRepository = await getContainerRepository();

    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id)
      .eq('id', params.id)
      .eq('type', 'page');

    const page = await containerRepository.getOneByQuery(databaseQuery);

    if (!page || page.type !== 'page') {
      throw new NotFoundError('Page not found', true);
    }

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

    const returnValue: GetPageDetailsResponse = {
      page: {
        id: page.id,
        name: page.name,
        emoji: page.emoji || null,
        lastUpdated: page.lastUpdated,
        createdAt: page.createdAt,
        parentId: page.parentId || null,
      },
    };

    if (linkedViews.length > 0) {
      returnValue.views = linkedViews;
    }

    if (query.includeBlocks) {
      returnValue.blocks = page.blocks ?? [];
    }
    if (query.includeValues) {
      returnValue.values = page.values ?? {};
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
    const existingPage = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'page')
    );

    if (!existingPage || existingPage.type !== 'page') {
      throw new NotFoundError('Page not found', true);
    }

    const filteredBody: Partial<typeof existingPage> = {};
    if (body.name !== undefined) {
      filteredBody.name = body.name.trim();
    }
    if (body.emoji !== undefined) {
      filteredBody.emoji = body.emoji;
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
      lastUpdated: updatedPage.lastUpdated,
      createdAt: updatedPage.createdAt,
      parentId: updatedPage.parentId || null,
    } satisfies UpdatePageResponse;
  }
);
