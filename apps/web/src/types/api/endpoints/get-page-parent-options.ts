import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const GET_PAGE_PARENT_OPTIONS_ENDPOINT = '/pages/:id/parent-options';
export const getPageParentOptionsParametersSchema = z.object({ id: z.string().min(1) });
export const getPageParentOptionsQuerySchema = z.object({
  action: z.enum(['copy', 'move']),
  query: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const pageParentOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  parentId: z.string().nullable(),
  isPrivate: z.boolean(),
  ancestorNames: z.array(z.string()),
});
export const getPageParentOptionsResponseSchema = z.object({
  rootAllowed: z.boolean(),
  options: z.array(pageParentOptionSchema),
});
export type GetPageParentOptionsParameters = z.infer<typeof getPageParentOptionsParametersSchema>;
export type GetPageParentOptionsQuery = z.infer<typeof getPageParentOptionsQuerySchema>;
export type GetPageParentOptionsResponse = z.infer<typeof getPageParentOptionsResponseSchema>;
export type GetPageParentOptionsResponseData = DataWrapper<GetPageParentOptionsResponse>;
