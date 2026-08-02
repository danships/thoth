import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository, getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { registerContainerAccessForNewPage } from '@/lib/database/container-access-service';
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import {
  assertGrantAllowsContainerForSession,
  assertGrantAllowsWrite,
  filterContainersByGrantForSession,
  memberToAccessGrant,
} from '@/lib/auth/access-grant';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { PageContainer } from '@/types/database';
import type { CreatePageBody, CreatePageResponse, GetPagesQuery, GetPagesResponse } from '@/types/api';
import { createPageBodySchema, getPagesQuerySchema, FAVORITES_MAX_LIMIT, RECENT_MAX_LIMIT } from '@/types/api';

export const GET = apiRoute<GetPagesResponse, GetPagesQuery, {}, {}>(
  {
    expectedQuerySchema: getPagesQuerySchema,
  },
  async ({ query }, session) => {
    const containerRepository = await getContainerRepository();

    if (query.favorited) {
      // Root-list parity: scope favorites to a single workspace (defaulting to the caller's
      // default workspace for backwards compatibility), rather than mixing starred pages
      // across every workspace the user belongs to.
      const workspaceId = query.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
      await assertWorkspaceAccess(session.user.id, workspaceId);

      // Bounded sidebar list, no cursor pagination — capped at the smaller of the caller's
      // `limit` and FAVORITES_MAX_LIMIT.
      const limit = query.limit ? Math.min(query.limit, FAVORITES_MAX_LIMIT) : FAVORITES_MAX_LIMIT;

      // ContainerAccess (starred/last-accessed) is per-user state — stays scoped by userId
      // (THOTH-042, Category B).
      const containerAccessRepository = await getContainerAccessRepository();
      const starredAccessRows = await containerAccessRepository.getByQuery(
        addWorkspaceIdToQuery(
          addUserIdToQuery(containerAccessRepository.createQuery().eq('starred', true), session.user.id),
          workspaceId
        )
          .sort('starredAt', 'desc')
          .limit(limit)
      );

      const containerIds = starredAccessRows.map((row) => row.containerId);
      const containersById = new Map<string, Awaited<ReturnType<typeof containerRepository.getByQuery>>[number]>();
      if (containerIds.length > 0) {
        // Content is scoped by workspace membership + grant, not creator (THOTH-042).
        const fetchedContainers = await containerRepository.getByQuery(
          addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId)
            .eq('type', 'page')
            .in('id', containerIds)
        );
        const scopedContainers = await filterContainersByGrantForSession(
          session,
          fetchedContainers.filter((container) => !container.deletedAt)
        );
        for (const container of scopedContainers) {
          containersById.set(container.id, container);
        }
      }

      return starredAccessRows
        .map((row) => {
          const container = containersById.get(row.containerId);
          // Skip rows whose container no longer exists (e.g. deleted since being starred, or
          // filtered out of an App key's scope above).
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

    if (query.recent) {
      // Root-list parity: scope Recent to a single workspace (defaulting to the caller's
      // default workspace for backwards compatibility), mirroring the `favorited` branch above.
      const workspaceId = query.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
      await assertWorkspaceAccess(session.user.id, workspaceId);

      // Bounded sidebar list, always capped at RECENT_MAX_LIMIT regardless of the caller's
      // `limit` (which may be as high as FAVORITES_MAX_LIMIT for the shared query schema).
      const limit = Math.min(query.limit ?? RECENT_MAX_LIMIT, RECENT_MAX_LIMIT);

      // ContainerAccess (starred/last-accessed) is per-user state — stays scoped by userId
      // (THOTH-042, Category B).
      const containerAccessRepository = await getContainerAccessRepository();
      const recentAccessRows = await containerAccessRepository.getByQuery(
        addWorkspaceIdToQuery(addUserIdToQuery(containerAccessRepository.createQuery(), session.user.id), workspaceId)
          .sort('lastAccessedAt', 'desc')
          .limit(limit)
      );

      const containerIds = recentAccessRows.map((row) => row.containerId);
      const containersById = new Map<string, Awaited<ReturnType<typeof containerRepository.getByQuery>>[number]>();
      if (containerIds.length > 0) {
        // Content is scoped by workspace membership + grant, not creator (THOTH-042).
        const fetchedContainers = await containerRepository.getByQuery(
          addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId)
            .eq('type', 'page')
            .in('id', containerIds)
        );
        const scopedContainers = await filterContainersByGrantForSession(
          session,
          fetchedContainers.filter((container) => !container.deletedAt)
        );
        for (const container of scopedContainers) {
          containersById.set(container.id, container);
        }
      }

      return recentAccessRows
        .map((row) => {
          const container = containersById.get(row.containerId);
          // Skip rows whose container no longer exists (e.g. deleted since being accessed, or
          // filtered out of an App key's scope above).
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
            ...(row.lastAccessedAt && { lastAccessedAt: row.lastAccessedAt }),
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

    // Get all pages that have this parentId. Content is scoped by workspace membership + grant,
    // not creator (THOTH-042) — the parent's own workspace is resolved and asserted via
    // `filterContainersByGrantForSession` below once the parent's siblings are fetched.
    const pages = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('parentId', parentId).eq('type', 'page')
    );

    const scopedPages = await filterContainersByGrantForSession(
      session,
      pages.filter((page): page is PageContainer => page.type === 'page' && !page.deletedAt)
    );

    return scopedPages.map((page) => {
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
      // stamp the new child with the same one. The parent can be either another page (nested
      // pages) or a data source (rows added inline from a data view's table), so we can't
      // filter the lookup down to `type: 'page'` alone.
      const parentContainer = await containerRepository.getOneByQuery(
        containerRepository.createQuery().eq('id', body.parentId)
      );

      if (
        !parentContainer ||
        parentContainer.deletedAt ||
        (parentContainer.type !== 'page' && parentContainer.type !== 'data-source')
      ) {
        throw new NotFoundError('Parent page not found or access denied');
      }

      // Content is scoped by workspace membership + grant, not creator (THOTH-042): membership
      // is asserted here, and mutation (write) permission against the parent container itself
      // is enforced below so a read-only-scoped member/App can't add children under a container
      // they can't write to.
      await assertWorkspaceAccess(session.user.id, parentContainer.workspaceId);
      await assertGrantAllowsContainerForSession(session, parentContainer, { mutating: true });

      workspaceId = parentContainer.workspaceId;
      parentId = body.parentId;
    } else {
      // Root-level page: no existing entity to derive the workspace from — enforce write
      // permission against the caller's own workspace-level grant instead (THOTH-042), so a
      // read-only-scoped member/App can't create new root pages.
      workspaceId = body.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
      const member = await assertWorkspaceAccess(session.user.id, workspaceId);
      const grant = session.appContext ? session.appContext.accessGrant : await memberToAccessGrant(member);
      assertGrantAllowsWrite(grant);
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
      deletedAt: null,
      deletedRootId: null,
    };

    const createdPage = await containerRepository.create(pageData);

    // Every root-level (and nested) page gets a `ContainerAccess` row for its owning user at
    // creation time, so the root-list pagination in `GET /pages/tree` can be driven entirely
    // off this table.
    await registerContainerAccessForNewPage(createdPage, session.user.id);

    scheduleNotifyPageChange('page.created', createdPage, { appId: session.appContext?.appId });

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
