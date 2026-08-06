import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const GET_DELETED_PAGES_ENDPOINT = '/pages/deleted';

export const getDeletedPagesQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
});
export type GetDeletedPagesQuery = z.infer<typeof getDeletedPagesQuerySchema>;

export const deletedPageEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['page', 'data-source', 'data-view']),
  deletedAt: z.string(),
  daysRemaining: z.number().int(),
});
export type DeletedPageEntry = z.infer<typeof deletedPageEntrySchema>;

export const getDeletedPagesResponseSchema = z.array(deletedPageEntrySchema);
export type GetDeletedPagesResponse = z.infer<typeof getDeletedPagesResponseSchema>;
export type GetDeletedPagesResponseData = DataWrapper<GetDeletedPagesResponse>;
