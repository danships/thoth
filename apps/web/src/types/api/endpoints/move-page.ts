import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';
export const MOVE_PAGE_ENDPOINT = '/pages/:id/move';
export const movePageParametersSchema = z.object({ id: z.string().min(1) });
export const movePageBodySchema = z.object({
  parentId: z.string().min(1).nullable(),
  expectedParentId: z.string().min(1).nullable(),
});
export const movePageResponseSchema = z.object({ page: pageSchema });
export type MovePageParameters = z.infer<typeof movePageParametersSchema>;
export type MovePageBody = z.infer<typeof movePageBodySchema>;
export type MovePageResponse = z.infer<typeof movePageResponseSchema>;
export type MovePageResponseData = DataWrapper<MovePageResponse>;
