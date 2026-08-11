import { z } from 'zod';
import { pageSchema, dataViewSchema } from '../entities';
import type { DataWrapper } from '../utilities';
import { getPageContentResponseSchema } from './get-page-content';
import { pageContainerSchema } from '@thoth/database/types';
import { columnSchema } from '@/types/schemas/entities/container';

export const GET_PAGE_DETAILS_ENDPOINT = '/pages/:id';

// Reserved `?v=` tab value for the "Sub Pages" tab (THOTH-034). Data-view ids are generated
// id strings, so this literal can never collide with a real view id or the existing
// `'contents'` tab value.
export const SUBPAGES_TAB_VALUE = 'subpages';

export const getPageDetailsResponseSchema = z.object({
  page: pageSchema,
  content: getPageContentResponseSchema.shape.content.optional(),
  values: pageContainerSchema.shape.values.optional(),
  views: z.array(dataViewSchema).optional(),
  columns: z.array(columnSchema).optional(),
  starred: z.boolean(),
  // Minimal additive flag: whether this page has at least one direct child `page` container.
  // Drives whether the "Sub Pages" tab is shown, without eagerly fetching the full child list
  // (which is instead fetched lazily via `usePagesByParent` only once the tab is opened).
  hasChildren: z.boolean(),
});

export type GetPageDetailsResponse = z.infer<typeof getPageDetailsResponseSchema>;
export type GetPageDetailsResponseData = DataWrapper<GetPageDetailsResponse>;

export const getPageDetailsParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetPageDetailsParameters = z.infer<typeof getPageDetailsParametersSchema>;

export const getPageDetailsQuerySchema = z.object({
  includeContent: z.coerce.boolean().default(false),
  includeValues: z.coerce.boolean().default(false),
  includeColumns: z.coerce.boolean().default(false),
});
export type GetPageDetailsQuery = z.infer<typeof getPageDetailsQuerySchema>;
