import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { pageSchema } from '../entities';
import { pageContainerSchema } from '@/types/database';

export const GET_PAGES_ENDPOINT = '/pages';

export const getPagesQuerySchema = z
  .object({
    parentId: z.string().min(1).optional(),
    dataSourceId: z.string().min(1).optional(),
    includeValues: z.coerce.boolean().optional().default(false),
  })
  .refine((data) => data.parentId || data.dataSourceId, {
    message: 'Either parentId or dataSourceId must be provided',
  });

export type GetPagesQuery = z.infer<typeof getPagesQuerySchema>;

export const getPagesResponseSchema = z.array(
  z.object({ page: pageSchema, values: pageContainerSchema.shape.values.optional() })
);
export type GetPagesResponse = z.infer<typeof getPagesResponseSchema>;
export type GetPagesResponseData = DataWrapper<GetPagesResponse>;
