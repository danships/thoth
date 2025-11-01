import { z } from 'zod';
import { pageSchema, dataViewSchema } from '../entities';
import type { DataWrapper } from '../utilities';
import { getPageBlocksResponseSchema } from './get-page-blocks';
import { pageContainerSchema } from '@/types/database';

export const GET_PAGE_DETAILS_ENDPOINT = '/pages/:id';

export const getPageDetailsResponseSchema = z.object({
  page: pageSchema,
  blocks: getPageBlocksResponseSchema.shape.blocks.optional(),
  values: pageContainerSchema.shape.values.optional(),
  views: z.array(dataViewSchema).optional(),
});

export type GetPageDetailsResponse = z.infer<typeof getPageDetailsResponseSchema>;
export type GetPageDetailsResponseData = DataWrapper<GetPageDetailsResponse>;

export const getPageDetailsParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetPageDetailsParameters = z.infer<typeof getPageDetailsParametersSchema>;

export const getPageDetailsQuerySchema = z.object({
  includeBlocks: z.coerce.boolean().default(false),
  includeValues: z.coerce.boolean().default(false),
});
export type GetPageDetailsQuery = z.infer<typeof getPageDetailsQuerySchema>;
