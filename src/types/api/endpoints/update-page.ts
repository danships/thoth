import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';
import { pageContainerSchema } from '@/types/database';

// Define the endpoint path
export const UPDATE_PAGE_ENDPOINT = '/pages/:id';

// Update page - allow updating name and emoji
export const updatePageBodySchema = pageContainerSchema
  .pick({
    name: true,
    emoji: true,
  })
  .partial();

export const updatePageResponseSchema = pageSchema;
export type UpdatePageBody = z.infer<typeof updatePageBodySchema>;
export type UpdatePageResponse = z.infer<typeof updatePageResponseSchema>;
export type UpdatePageResponseData = DataWrapper<UpdatePageResponse>;

// Parameters for ID-based operations
export const updatePageParametersSchema = z.object({
  id: z.string().min(1),
});
export type UpdatePageParameters = z.infer<typeof updatePageParametersSchema>;
