import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository, getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { registerContainerAccessForNewPage } from '@/lib/database/container-access-service';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { CreatePageBody, CreatePageResponse, GetPagesQuery, GetPagesResponse } from '@/types/api';
import { createPageBodySchema, getPagesQuerySchema, FAVORITES_MAX_LIMIT } from '@/types/api';

export const GET = apiRoute<GetPagesResponse, GetPagesQuery, {}, {}>(
  {
    expectedQuerySchema: getPagesQuerySchema,
  },
  async ({ query }, session) => {
    const containerRepository = await getContainerRepository();

    if (query.favorited) {
      // Bounded sidebar list, no cursor pagination — capped at the smaller of the caller's
      // `limit` and FAVORITES_MAX_LIMIT.
      const limit = query.limit ? Math.min(query.limit, FAVORITES_MAX_LIMIT) : FAVORITES_MAX_LIMIT;

      const containerAccessRepository = await getContainerAccessRepository();
      const starredAccessRows = await containerAccessRepository.getByQuery(
        addUserIdToQuery(containerAccessRepository.createQuery().eq('starred', true), session.user.id)
          .sort('starredAt', 'desc')
          .limit(limit)
      );

      const containerIds = starredAccessRows.map((row) => row.containerId);
      const containersById = new Map<string, Awaited<ReturnType<typeof containerRepository.getByQuery>>[number]>();
      if (containerIds.length > 0) {
        const fetchedContainers = await containerRepository.getByQuery(
          addUserIdToQuery(containerRepository.createQuery(), session.user.id).eq('type', 'page').in('id', containerIds)
        );
        for (const container of fetchedContainers) {
          containersById.set(container.id, container);
        }
      }

      return starredAccessRows
        .map((row) => {
          const container = containersById.get(row.containerId);
          // Skip rows whose container no longer exists (e.g. deleted since being starred).
          if (!container || container.type !== 'page') {
            return undefined;
          }
          const returnValue: GetPagesResponse[number] = {
            page: {
              id: container.id,
              name: container.name,
              emoji: container.emoji || null,
              parentId: container.parentId || null,
              createdAt: container.createdAt,
              lastUpdated: container.lastUpdated,
            },
            ...(row.starredAt && { starredAt: row.starredAt }),
          };
          if (query.includeValues) {
            returnValue.values = container.values;
          }
          return returnValue;
        })
        .filter((entry): entry is GetPagesResponse[number] => entry !== undefined);
    }

    // Use either parentId or dataSourceId as the parentId in the query
    const parentId = query.parentId || query.dataSourceId;

    if (!parentId) {
      throw new BadRequestError('Either parentId or dataSourceId must be provided.');
    }

    // Get all pages that have this parentId
    const pages = await containerRepository.getByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('parentId', parentId).eq('type', 'page'), session.user.id)
    );

    return pages
      .filter((page) => page.type === 'page')
      .map((page) => {
        const returnValue: GetPagesResponse[number] = {
          page: {
            id: page.id,
            name: page.name,
            emoji: page.emoji || null,
            parentId: page.parentId || null,
            createdAt: page.createdAt,
            lastUpdated: page.lastUpdated,
          },
        };
        if (query.includeValues) {
          returnValue.values = page.values;
        }
        return returnValue;
      });
  }
);

export const POST = apiRoute<CreatePageResponse, {}, {}, CreatePageBody>(
  {
    expectedBodySchema: createPageBodySchema,
  },
  async ({ body }, session) => {
    if (!body) {
      throw new Error('Body is required');
    }

    const containerRepository = await getContainerRepository();

    let workspaceId: string;
    let parentId: string | null = null;

    if (body.parentId) {
      // Derive the workspace from the parent entity rather than trusting a client-supplied
      // `workspaceId` — fetch the parent by id, authorize against its own `workspaceId`, and
      // stamp the new child with the same one.
      const parentPage = await containerRepository.getOneByQuery(
        containerRepository.createQuery().eq('id', body.parentId).eq('type', 'page')
      );

      if (!parentPage || parentPage.type !== 'page') {
        throw new NotFoundError('Parent page not found or access denied');
      }

      await assertWorkspaceAccess(session.user.id, parentPage.workspaceId);

      workspaceId = parentPage.workspaceId;
      parentId = body.parentId;
    } else {
      // Root-level page: no existing entity to derive the workspace from.
      workspaceId = body.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
      await assertWorkspaceAccess(session.user.id, workspaceId);
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspaceId));
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Create the page container with the provided data
    const pageData = {
      name: body.name,
      emoji: body.emoji || null,
      type: 'page' as const,
      parentId,
      workspaceId: workspace.id,
      userId: session.user.id,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const createdPage = await containerRepository.create(pageData);

    // Every root-level (and nested) page gets a `ContainerAccess` row for its owning user at
    // creation time, so the root-list pagination in `GET /pages/tree` can be driven entirely
    // off this table.
    await registerContainerAccessForNewPage(createdPage, session.user.id);

    const returnValue: CreatePageResponse = {
      id: createdPage.id,
      name: createdPage.name,
      emoji: 'emoji' in createdPage ? createdPage.emoji : null,
      parentId: createdPage.parentId || null,
      createdAt: createdPage.createdAt,
      lastUpdated: createdPage.lastUpdated,
    };

    return returnValue;
  }
);
