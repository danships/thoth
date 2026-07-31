import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository, getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { filterContainersByGrantForSession } from '@/lib/auth/access-grant';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { ContainerAccess } from '@/types/database';
import type { GetPagesTreeQueryVariables, GetPagesTreeResponse, PagesTreeCursor, Page, DataView } from '@/types/api';
import {
  getPagesTreeQueryVariablesSchema,
  pagesTreeCursorSchema,
  PAGES_TREE_DEFAULT_LIMIT,
  CHILD_PREVIEW_LIMIT,
} from '@/types/api';

// Over-fetch buffer used on top of `limit + 1` when querying `ContainerAccess` rows, to
// absorb rows that share the exact same `lastAccessedAt` as the cursor position (dropped via
// the containerId tie-break below) without under-fetching real results.
const SAFETY_MARGIN = 5;

// Safety valve against runaway loops: `ContainerAccess` rows are per-page (root and nested),
// so root pages can be interleaved with many nested-page rows in the global lastAccessedAt
// order. This bounds how many over-fetch batches we're willing to walk through to collect a
// page of root results.
const MAX_BATCHES = 50;

function encodeCursor(cursor: PagesTreeCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): PagesTreeCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestError('Invalid cursor');
  }

  const result = pagesTreeCursorSchema.safeParse(parsed);
  if (!result.success) {
    throw new BadRequestError('Invalid cursor');
  }

  return result.data;
}

/**
 * Collects the next page of root-level `ContainerAccess` rows, sorted by `lastAccessedAt`
 * desc (with `containerId` desc as a tie-break for deterministic ordering/pagination).
 *
 * SuperSave does not support filtering `parentId` by `null` at the query level (the same
 * documented limitation `Container` queries work around), and root vs. nested `ContainerAccess`
 * rows can be arbitrarily interleaved in the global `lastAccessedAt` order. So rather than a
 * single over-fetch, this walks batches of `limit + 1 + SAFETY_MARGIN` rows (dropping rows at
 * or before the resuming cursor position in application code) until enough root rows have been
 * collected or the table is exhausted.
 */
async function fetchRootContainerAccessPage(
  userId: string,
  workspaceId: string,
  limit: number,
  initialCursor: PagesTreeCursor | undefined
): Promise<{ rows: ContainerAccess[]; hasMore: boolean }> {
  const containerAccessRepository = await getContainerAccessRepository();

  const collected: ContainerAccess[] = [];
  let cursor = initialCursor;
  let batches = 0;

  while (collected.length < limit + 1 && batches < MAX_BATCHES) {
    batches += 1;

    const batchQuery = addUserIdToQuery(containerAccessRepository.createQuery(), userId)
      .eq('workspaceId', workspaceId)
      .sort('lastAccessedAt', 'desc')
      .sort('containerId', 'desc')
      .limit(limit + 1 + SAFETY_MARGIN);

    if (cursor) {
      batchQuery.lte('lastAccessedAt', cursor.lastAccessedAt);
    }

    const batch = await containerAccessRepository.getByQuery(batchQuery);

    if (batch.length === 0) {
      break;
    }

    // Drop rows already returned in a previous batch: any row with a later lastAccessedAt
    // than the cursor was already excluded by the `lte` filter; rows sharing the exact same
    // lastAccessedAt as the cursor are disambiguated via the containerId tie-break.
    const cursorSnapshot = cursor;
    const freshRows = cursorSnapshot
      ? batch.filter((row) => {
          if (row.lastAccessedAt !== cursorSnapshot.lastAccessedAt) {
            return true;
          }
          return row.containerId < cursorSnapshot.containerId;
        })
      : batch;

    collected.push(...freshRows.filter((row) => !row.parentId));

    const lastRowInBatch = batch.at(-1);
    if (!lastRowInBatch) {
      break;
    }
    cursor = { lastAccessedAt: lastRowInBatch.lastAccessedAt, containerId: lastRowInBatch.containerId };

    // Fewer rows than requested means we've reached the end of the table.
    if (batch.length < limit + 1 + SAFETY_MARGIN) {
      break;
    }
  }

  const hasMore = collected.length > limit;
  return { rows: collected.slice(0, limit), hasMore };
}

export const GET = apiRoute<GetPagesTreeResponse, GetPagesTreeQueryVariables, {}>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
  },
  async ({ query }, session) => {
    const containerRepository = await getContainerRepository();
    const limit = query?.limit ?? PAGES_TREE_DEFAULT_LIMIT;

    let containers: Awaited<ReturnType<typeof containerRepository.getByQuery>>;
    let pagination: GetPagesTreeResponse['pagination'];

    if (query?.parentId) {
      // Expanding a specific node: derive the workspace from the parent entity (rather than
      // trusting a client-supplied `workspaceId`) and authorize against it.
      const parent = await containerRepository.getOneByQuery(
        containerRepository.createQuery().eq('id', query.parentId).eq('type', 'page')
      );
      if (!parent || parent.type !== 'page' || parent.deletedAt) {
        throw new NotFoundError('Parent page not found');
      }
      await assertWorkspaceAccess(session.user.id, parent.workspaceId);

      // this listing remains fully unpaginated, per the explicit out-of-scope decision for
      // child listings in this ticket.
      containers = await containerRepository.getByQuery(
        addUserIdToQuery(containerRepository.createQuery(), session.user.id)
          .eq('type', 'page')
          .eq('parentId', query.parentId)
          .sort('lastUpdated', 'desc')
      );
      containers = containers.filter((container) => !container.deletedAt);
      pagination = { nextCursor: null, hasMore: false };
    } else {
      // Root list: no existing entity to derive the workspace from, so `workspaceId` is
      // required here (falling back to the caller's default workspace for backwards
      // compatibility with pre-multi-workspace clients).
      let workspaceId = query?.workspaceId;
      if (!workspaceId) {
        workspaceId = await resolveDefaultWorkspaceId(session.user.id);
      }
      await assertWorkspaceAccess(session.user.id, workspaceId);

      // Root list: cursor-paginated, driven off `ContainerAccess.lastAccessedAt` rather than
      // `Container.lastUpdated`.
      const cursor = query?.cursor ? decodeCursor(query.cursor) : undefined;
      const { rows, hasMore } = await fetchRootContainerAccessPage(session.user.id, workspaceId, limit, cursor);

      const containerIds = rows.map((row) => row.containerId);
      const containersById = new Map<string, Awaited<ReturnType<typeof containerRepository.getByQuery>>[number]>();
      if (containerIds.length > 0) {
        const fetchedContainers = await containerRepository.getByQuery(
          addWorkspaceIdToQuery(addUserIdToQuery(containerRepository.createQuery(), session.user.id), workspaceId)
            .eq('type', 'page')
            .in('id', containerIds)
        );
        for (const container of fetchedContainers.filter((candidate) => !candidate.deletedAt)) {
          containersById.set(container.id, container);
        }
      }

      // Preserve the ContainerAccess-driven (last-accessed) order; a page with no matching
      // container is skipped (e.g. deleted since the access row was written).
      containers = rows
        .map((row) => containersById.get(row.containerId))
        .filter((container): container is NonNullable<typeof container> => container !== undefined);

      const lastRow = rows.at(-1);
      pagination = {
        nextCursor:
          hasMore && lastRow
            ? encodeCursor({ lastAccessedAt: lastRow.lastAccessedAt, containerId: lastRow.containerId })
            : null,
        hasMore,
      };
    }

    // Filter out-of-scope containers for bearer-token (App-key) callers — a no-op for
    // session-cookie callers. Applied after both branches above so a scoped key can never
    // enumerate out-of-scope page titles via the tree endpoint (root list or child expansion).
    containers = await filterContainersByGrantForSession(session, containers);

    // Separate containers that have views from those that don't
    const containersWithViews = containers.filter(
      (container) => container.type === 'page' && 'views' in container && container.views && container.views.length > 0
    );
    const parentIds = containers.map((container) => container.id).filter(Boolean);

    // Query for child pages only for containers without views. Fetched unbounded (no per-parent
    // DB limit, since SuperSave's `in` query can't express a per-group limit) and then capped to
    // CHILD_PREVIEW_LIMIT per parent in application code below, with overflow tracked so the UI
    // can show a "more inside" indicator instead of paginating child listings.
    const databaseChildren =
      parentIds.length > 0
        ? await containerRepository.getByQuery(
            addUserIdToQuery(containerRepository.createQuery(), session.user.id)
              .in('parentId', parentIds)
              .sort('lastUpdated', 'desc')
          )
        : [];
    const visibleChildren = databaseChildren.filter((child) => !child.deletedAt && child.type === 'page');

    const childCountByParent = new Map<string, number>();
    for (const child of visibleChildren) {
      if (!child.parentId) {
        continue;
      }
      childCountByParent.set(child.parentId, (childCountByParent.get(child.parentId) ?? 0) + 1);
    }

    // Fetch views for containers that have them
    const dataViewRepository = await getDataViewRepository();
    const allViewIds = containersWithViews.flatMap((container) =>
      container.type === 'page' && 'views' in container ? (container.views ?? []) : []
    );

    const viewsMap = new Map<string, Awaited<ReturnType<typeof dataViewRepository.getByQuery>>[number]>();
    if (allViewIds.length > 0) {
      const views = await dataViewRepository.getByQuery(
        addUserIdToQuery(dataViewRepository.createQuery(), session.user.id).in('id', allViewIds)
      );
      for (const view of views.filter((candidate) => !candidate.deletedAt)) {
        viewsMap.set(view.id, view);
      }
    }

    return {
      branches: containers.map((container) => {
        const hasViews =
          container.type === 'page' && 'views' in container && container.views && container.views.length > 0;

        // Children always contains only pages, capped to CHILD_PREVIEW_LIMIT for preview.
        const children: Array<{ page: Page }> = visibleChildren
          .filter((child) => child.parentId === container.id)
          .slice(0, CHILD_PREVIEW_LIMIT)
          .map((child): { page: Page } => ({
            page: {
              id: child.id,
              name: child.name,
              emoji: 'emoji' in child ? child.emoji || null : null,
              lastUpdated: child.lastUpdated,
              createdAt: child.createdAt,
              parentId: child.parentId || null,
            },
          }));

        const hasMoreChildren = (childCountByParent.get(container.id) ?? 0) > CHILD_PREVIEW_LIMIT;

        // Views are in a separate field
        let views: DataView[] = [];
        if (hasViews && 'views' in container) {
          const containerViewIds = container.views ?? [];
          views = containerViewIds
            .map((viewId) => viewsMap.get(viewId))
            .filter((view): view is NonNullable<typeof view> => view !== undefined)
            .map((view): DataView => ({
              id: view.id,
              name: view.name,
              lastUpdated: view.lastUpdated,
              createdAt: view.createdAt,
              dataSourceId: view.dataSourceId,
            }));
        }

        return {
          page: {
            id: container.id,
            name: container.name,
            emoji: 'emoji' in container ? container.emoji || null : null,
            lastUpdated: container.lastUpdated,
            createdAt: container.createdAt,
            parentId: container.parentId || null,
          },
          children,
          ...(hasMoreChildren && { hasMoreChildren }),
          views,
        };
      }),
      pagination,
    };
  }
);
