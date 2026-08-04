import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { sortByManualOrder } from '@/lib/database/sort-order-service';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { filterContainersByGrantForSession } from '@/lib/auth/access-grant';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { Container } from '@/types/database';
import type { GetPagesTreeQueryVariables, GetPagesTreeResponse, PagesTreeCursor, Page, DataView } from '@/types/api';
import {
  getPagesTreeQueryVariablesSchema,
  pagesTreeCursorSchema,
  PAGES_TREE_DEFAULT_LIMIT,
  CHILD_PREVIEW_LIMIT,
} from '@/types/api';

// Over-fetch buffer used on top of `limit + 1` when querying `Container` rows, to absorb rows
// that share the exact same `lastUpdated` as the cursor position (dropped via the `id`
// tie-break below) without under-fetching real results.
const SAFETY_MARGIN = 5;

// Safety valve against runaway loops: root and nested pages are interleaved in the workspace's
// global `lastUpdated` order, so this bounds how many over-fetch batches we're willing to walk
// through to collect a page of root results.
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
 * Collects the next page of root-level `Container` (page) rows, sorted by `lastUpdated` desc
 * (with `id` desc as a tie-break for deterministic ordering/pagination). Workspace-scoped
 * `Container.lastUpdated` drives the regular root list (THOTH-042, DECISION 1) instead of the
 * per-user `ContainerAccess.lastAccessedAt`, so a brand-new workspace member sees the full,
 * populated root tree immediately.
 *
 * SuperSave does not support filtering `parentId` by `null` at the query level (the same
 * documented limitation elsewhere in this file), and root vs. nested pages can be arbitrarily
 * interleaved in the global `lastUpdated` order. So rather than a single over-fetch, this walks
 * batches of `limit + 1 + SAFETY_MARGIN` rows (dropping rows at or before the resuming cursor
 * position in application code) until enough root rows have been collected or the table is
 * exhausted.
 */
async function fetchRootContainerPage(
  workspaceId: string,
  limit: number,
  initialCursor: PagesTreeCursor | undefined
): Promise<{ rows: Container[]; hasMore: boolean }> {
  const containerRepository = await getContainerRepository();

  const collected: Container[] = [];
  let cursor = initialCursor;
  let batches = 0;

  while (collected.length < limit + 1 && batches < MAX_BATCHES) {
    batches += 1;

    const batchQuery = addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId)
      .eq('type', 'page')
      .sort('lastUpdated', 'desc')
      .sort('id', 'desc')
      .limit(limit + 1 + SAFETY_MARGIN);

    if (cursor) {
      batchQuery.lte('lastUpdated', cursor.lastUpdated);
    }

    const batch = await containerRepository.getByQuery(batchQuery);

    if (batch.length === 0) {
      break;
    }

    // Drop rows already returned in a previous batch: any row with a later lastUpdated than
    // the cursor was already excluded by the `lte` filter; rows sharing the exact same
    // lastUpdated as the cursor are disambiguated via the id tie-break.
    const cursorSnapshot = cursor;
    const freshRows = cursorSnapshot
      ? batch.filter((row) => {
          if (row.lastUpdated !== cursorSnapshot.lastUpdated) {
            return true;
          }
          return row.id < cursorSnapshot.containerId;
        })
      : batch;

    collected.push(...freshRows.filter((row) => !row.parentId && !row.deletedAt));

    const lastRowInBatch = batch.at(-1);
    if (!lastRowInBatch) {
      break;
    }
    cursor = { lastUpdated: lastRowInBatch.lastUpdated, containerId: lastRowInBatch.id };

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

    let containers: Container[];
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
      // child listings in this ticket. Content is scoped by workspace membership + grant, not
      // creator (THOTH-042) — anchored on the parent's own (already-authorised) workspace.
      // Manual order (THOTH-036) is the default for child listings — `sortOrder asc` (root list
      // ordering is unchanged and stays out of scope, see `fetchRootContainerPage` below).
      containers = await containerRepository.getByQuery(
        addWorkspaceIdToQuery(containerRepository.createQuery(), parent.workspaceId)
          .eq('type', 'page')
          .eq('parentId', query.parentId)
          .sort('sortOrder', 'asc')
      );
      containers = sortByManualOrder(containers.filter((container) => !container.deletedAt));
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

      // Root list: cursor-paginated, driven off workspace-scoped `Container.lastUpdated`
      // (THOTH-042, DECISION 1) rather than the per-user `ContainerAccess.lastAccessedAt` — so a
      // brand-new workspace member sees the full, populated root tree immediately, not just
      // pages they've personally opened. The `ContainerAccess` ordering machinery is retained,
      // unused here, for THOTH-035's future "Recently accessed" menu.
      const cursor = query?.cursor ? decodeCursor(query.cursor) : undefined;
      const { rows, hasMore } = await fetchRootContainerPage(workspaceId, limit, cursor);

      containers = rows;

      const lastRow = containers.at(-1);
      pagination = {
        nextCursor:
          hasMore && lastRow ? encodeCursor({ lastUpdated: lastRow.lastUpdated, containerId: lastRow.id }) : null,
        hasMore,
      };
    }

    // Filter out-of-scope containers — a no-op for `workspace`/`read_write` callers (every
    // pre-THOTH-042 owner and App), and enforces real scope for scoped members/Apps alike.
    // Applied after both branches above so a scoped caller can never enumerate out-of-scope
    // page titles via the tree endpoint (root list or child expansion).
    containers = await filterContainersByGrantForSession(session, containers);

    // Separate containers that have views from those that don't
    const containersWithViews = containers.filter(
      (container) => container.type === 'page' && 'views' in container && container.views && container.views.length > 0
    );
    const parentIds = containers.map((container) => container.id).filter(Boolean);

    // Query for child pages only for containers without views. Fetched unbounded (no per-parent
    // DB limit, since SuperSave's `in` query can't express a per-group limit) and then capped to
    // CHILD_PREVIEW_LIMIT per parent in application code below, with overflow tracked so the UI
    // can show a "more inside" indicator instead of paginating child listings. Content is scoped
    // by workspace membership + grant, not creator (THOTH-042); every container here was already
    // resolved to a single, already-authorised `workspaceId` above (Pattern C).
    const databaseChildren =
      parentIds.length > 0
        ? await filterContainersByGrantForSession(
            session,
            await containerRepository.getByQuery(
              containerRepository.createQuery().in('parentId', parentIds).sort('sortOrder', 'asc')
            )
          )
        : [];
    const visibleChildren = sortByManualOrder(
      databaseChildren.filter((child) => !child.deletedAt && child.type === 'page')
    );

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
      const views = await dataViewRepository.getByQuery(dataViewRepository.createQuery().in('id', allViewIds));
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
              sortOrder: child.sortOrder ?? null,
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
              filters: view.filters,
              sorts: view.sorts,
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
            sortOrder: container.sortOrder ?? null,
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
