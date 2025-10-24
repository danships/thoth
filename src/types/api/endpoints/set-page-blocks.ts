import { z } from 'zod';
import { blockSchema } from '@/types/schemas/blocks';

// Define the endpoint path
export const SET_PAGE_BLOCKS = '/pages/:pageId/blocks';

export const setPageBlocksParametersSchema = z.object({
  id: z.string().min(1),
});

export type SetPageBlocksParameters = z.infer<typeof setPageBlocksParametersSchema>;

// Define body schema for setting the blocks
export const setPageBlocksBodySchema = z.object({
  blocks: z.array(blockSchema),
});

export type SetPageBlocksBody = z.infer<typeof setPageBlocksBodySchema>;
