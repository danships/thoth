import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { pageSchema } from '../entities';
import { pageContainerSchema } from '@/types/database';

export const GET_PAGES_ENDPOINT = '/pages';

// Hard cap on the number of favorites returned by `GET /pages?favorited=true` — a bounded
// sidebar list, not an infinite-scroll/paginated one like the root tree.
export const FAVORITES_MAX_LIMIT = 50;

export const getPagesQuerySchema = z
  .object({
    parentId: z.string().min(1).optional(),
    dataSourceId: z.string().min(1).optional(),
    favorited: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(FAVORITES_MAX_LIMIT).optional(),
    includeValues: z.coerce.boolean().optional().default(false),
  })
  .refine((data) => data.parentId || data.dataSourceId || data.favorited, {
    message: 'Either parentId, dataSourceId, or favorited must be provided',
  });

export type GetPagesQuery = z.infer<typeof getPagesQuerySchema>;

export const getPagesResponseSchema = z.array(
  z.object({
    page: pageSchema,
    values: pageContainerSchema.shape.values.optional(),
    starredAt: z.iso.datetime({ offset: true }).optional(),
  })
);
export type GetPagesResponse = z.infer<typeof getPagesResponseSchema>;
export type GetPagesResponseData = DataWrapper<GetPagesResponse>;
