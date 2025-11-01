import z from 'zod';
import { Block } from '@blocknote/core';

export const GET_PAGE_BLOCKS_ENDPOINT = '/pages/:id/blocks';

export const getPageBlocksParametersSchema = z.object({
  id: z.string().min(1),
});

export type GetPageBlocksParameters = z.infer<typeof getPageBlocksParametersSchema>;

// TODO generate/get block validation schemas for blocks
export const getPageBlocksResponseSchema = z.object({
  blocks: z.array(z.any()),
});

export type GetPageBlocksResponse = {
  blocks: Block[];
};
