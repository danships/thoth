import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { pageSchema } from '../entities';

export const GET_PAGES_ENDPOINT = '/pages';

export const getPagesQuerySchema = z
  .object({
    parentId: z.string().min(1).optional(),
    dataSourceId: z.string().min(1).optional(),
  })
  .refine((data) => data.parentId || data.dataSourceId, {
    message: 'Either parentId or dataSourceId must be provided',
  });

export type GetPagesQuery = z.infer<typeof getPagesQuerySchema>;

export const getPagesResponseSchema = z.array(pageSchema);
export type GetPagesResponse = z.infer<typeof getPagesResponseSchema>;
export type GetPagesResponseData = DataWrapper<GetPagesResponse>;
