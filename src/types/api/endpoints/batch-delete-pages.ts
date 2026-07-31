import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { batchFailureSchema, batchTrashBodySchema } from './batch-restore-pages';

export const BATCH_DELETE_PAGES_ENDPOINT = '/pages/deleted/delete';

export type BatchDeletePagesBody = z.infer<typeof batchTrashBodySchema>;

export const batchDeletePagesResponseSchema = z.object({
  deleted: z.array(z.string().min(1)),
  failed: z.array(batchFailureSchema),
});
export type BatchDeletePagesResponse = z.infer<typeof batchDeletePagesResponseSchema>;
export type BatchDeletePagesResponseData = DataWrapper<BatchDeletePagesResponse>;

export { batchTrashBodySchema } from './batch-restore-pages';
