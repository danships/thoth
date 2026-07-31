import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { batchTrashBodySchema } from './batch-restore-pages';

export const BATCH_DELETE_PAGES_ENDPOINT = '/pages/deleted/delete';

export type BatchDeletePagesBody = z.infer<typeof batchTrashBodySchema>;

const batchDeleteFailureSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});

export const batchDeletePagesResponseSchema = z.object({
  deleted: z.array(z.string().min(1)),
  failed: z.array(batchDeleteFailureSchema),
});
export type BatchDeletePagesResponse = z.infer<typeof batchDeletePagesResponseSchema>;
export type BatchDeletePagesResponseData = DataWrapper<BatchDeletePagesResponse>;

export { batchTrashBodySchema } from './batch-restore-pages';
