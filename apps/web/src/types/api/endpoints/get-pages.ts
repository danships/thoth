import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { pageSchema } from '../entities';
import { pageContainerSchema } from '@thoth/database/types';

export const GET_PAGES_ENDPOINT = '/pages';

// Hard cap on the number of favorites returned by `GET /pages?favorited=true` — a bounded
// sidebar list, not an infinite-scroll/paginated one like the root tree.
export const FAVORITES_MAX_LIMIT = 50;

// Hard cap on the number of pages returned by `GET /pages?recent=true` — a bounded sidebar
// list of the most-recently-accessed pages, per THOTH-035.
export const RECENT_MAX_LIMIT = 15;

// Hard cap on the number of pages returned per page of a `viewId`-driven, filtered/sorted query
// (THOTH-037) — the raw-SQL path is cursor-paginated, unlike the legacy in-memory `parentId`
// path, so this only bounds a single page of results, not the total.
export const PAGES_QUERY_MAX_LIMIT = 200;
export const PAGES_QUERY_DEFAULT_LIMIT = 50;

export const getPagesQuerySchema = z
  .object({
    parentId: z.string().min(1).optional(),
    dataSourceId: z.string().min(1).optional(),
    favorited: z.stringbool().optional(),
    recent: z.stringbool().optional(),
    workspaceId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(PAGES_QUERY_MAX_LIMIT).optional(),
    includeValues: z.coerce.boolean().optional().default(false),
    // THOTH-037: when set, delegates to `pageQueryService` using the view's persisted (or
    // inline-overridden) `filters`/`sorts` instead of the legacy in-memory `parentId` path.
    viewId: z.string().min(1).optional(),
    cursor: z.string().min(1).optional(),
    // Inline overrides of a view's persisted filter/sort config, JSON-encoded (mirrors the
    // `PATCH /views/:id` body shape). Only meaningful alongside `viewId`.
    filters: z.string().optional(),
    sorts: z.string().optional(),
  })
  .refine((data) => data.parentId || data.dataSourceId || data.favorited || data.recent || data.viewId, {
    message: 'Either parentId, dataSourceId, favorited, recent, or viewId must be provided',
  })
  .refine((data) => !(data.viewId && (data.favorited || data.recent)), {
    message: 'viewId cannot be combined with favorited or recent',
  })
  .refine((data) => !((data.filters || data.sorts) && !data.viewId), {
    message: 'filters/sorts require viewId to be provided',
  });

export type GetPagesQuery = z.infer<typeof getPagesQuerySchema>;

export const getPagesResponseSchema = z.array(
  z.object({
    page: pageSchema,
    values: pageContainerSchema.shape.values.optional(),
    starredAt: z.iso.datetime({ offset: true }).optional(),
    lastAccessedAt: z.iso.datetime({ offset: true }).optional(),
  })
);

export const getPagesPaginationSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type GetPagesPagination = z.infer<typeof getPagesPaginationSchema>;

// `pagination` is returned as a root-level field alongside `data` (i.e. `{ data: [...],
// pagination: {...} }`), not nested inside `data` — it's only populated when the raw-SQL
// (`viewId`) path is used; the legacy in-memory paths (`parentId`/`dataSourceId`/`favorited`/
// `recent`) stay unpaginated, so it's omitted (`undefined`) for those, preserving byte-for-byte
// `data` shape for existing callers.
export type GetPagesResponse = z.infer<typeof getPagesResponseSchema>;
export type GetPagesResponseData = DataWrapper<GetPagesResponse> & { pagination?: GetPagesPagination };

// Opaque cursor shape for the `viewId`-driven raw-SQL path — encoded as a base64 JSON string,
// mirroring the `pagesTreeCursorSchema` idiom in `get-pages-tree.ts`. Generic over the number of
// configured sort keys (`values`), plus a trailing `containerId` tiebreak.
export const pageQueryCursorSchema = z.object({
  values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  containerId: z.string().min(1),
});
export type PageQueryCursorShape = z.infer<typeof pageQueryCursorSchema>;
