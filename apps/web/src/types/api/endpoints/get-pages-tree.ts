import { z } from 'zod';
import { withIdSchema } from '../../schemas/utilities';
import { pageSchema, dataViewSchema } from '../entities';
import type { DataWrapper } from '../utilities';

export const GET_PAGES_TREE_ENDPOINT = '/pages/tree';

// Default and max number of root-level branches returned per page of the cursor-based
// root list. Nested/child listings are not paginated (see CHILD_PREVIEW_LIMIT below).
export const PAGES_TREE_DEFAULT_LIMIT = 20;

// Preview cap for children rendered inline under a root branch. If a root page has more
// children than this, `hasMoreChildren` is set so the UI can show a "more inside" indicator
// instead of pagination — child-listing pagination is out of scope for this ticket.
export const CHILD_PREVIEW_LIMIT = 10;

const pagesTreeBranchSchema = z.array(
  z.object({
    page: pageSchema.extend(withIdSchema.shape),
    children: z.array(
      z.object({
        page: pageSchema,
      })
    ),
    hasMoreChildren: z.boolean().optional(),
    views: z.array(dataViewSchema).optional(),
  })
);

export const getPagesTreeResponseSchema = z.object({
  branches: pagesTreeBranchSchema,
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type GetPagesTreeResponse = z.infer<typeof getPagesTreeResponseSchema>;
export type GetPagesTreeResponseData = DataWrapper<GetPagesTreeResponse>;

export const getPagesTreeQueryVariablesSchema = z.object({
  parentId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // Required for the root listing (no `parentId`) — there's no existing entity to derive the
  // workspace from in that case.
  workspaceId: z.string().min(1).optional(),
});
export type GetPagesTreeQueryVariables = z.infer<typeof getPagesTreeQueryVariablesSchema>;

// Opaque cursor shape — encoded as a base64 JSON string. It is purely a sort-position
// marker (`lastUpdated` + `containerId` tie-break), not a lookup key: it remains valid even
// if the container it refers to has since been deleted. Sourced from `Container.lastUpdated`
// (workspace-scoped), not the per-user `ContainerAccess.lastAccessedAt` (THOTH-042, DECISION 1)
// — the per-user ordering is retained on `ContainerAccess` for THOTH-035's future "Recently
// accessed" menu, just no longer used to drive this regular root list.
export const pagesTreeCursorSchema = z.object({
  lastUpdated: z.string(),
  containerId: z.string().min(1),
});
export type PagesTreeCursor = z.infer<typeof pagesTreeCursorSchema>;
