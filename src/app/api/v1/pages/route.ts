import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import type { CreatePageBody, CreatePageResponse } from '@/types/api';
import { createPageBodySchema } from '@/types/api';

export const POST = apiRoute<CreatePageResponse, {}, {}, CreatePageBody>(
  {
    expectedBodySchema: createPageBodySchema,
  },
  async ({ body }, session) => {
    if (!body) {
      throw new Error('Body is required');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      addUserIdToQuery(workspaceRepository.createQuery(), session.user.id)
    );

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const containerRepository = await getContainerRepository();

    // Validate parent page access if parentId is provided
    let parentId = null;
    if (body.parentId) {
      const parentPage = await containerRepository.getOneByQuery(
        addUserIdToQuery(containerRepository.createQuery().eq('id', body.parentId), session.user.id)
      );

      if (!parentPage) {
        throw new Error('Parent page not found or access denied');
      }

      // Ensure the parent page belongs to the same workspace
      if (parentPage.workspaceId !== workspace.id) {
        throw new Error('Parent page does not belong to the same workspace');
      }

      parentId = body.parentId;
    }

    // Create the page container with the provided data
    const pageData = {
      name: body.name,
      emoji: body.emoji || null,
      type: 'page' as const,
      parentId: parentId || null,
      workspaceId: workspace.id,
      userId: session.user.id,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const createdPage = await containerRepository.create(pageData);

    return {
      id: createdPage.id,
      name: createdPage.name,
      emoji: createdPage.emoji || null,
      type: createdPage.type as 'page',
      parentId: createdPage.parentId || null,
      createdAt: createdPage.createdAt,
      lastUpdated: createdPage.lastUpdated,
    };
  }
);
