import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const BATCH_RESTORE_PAGES_ENDPOINT = '/pages/deleted/restore';

export const batchTrashBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});
export type BatchTrashBody = z.infer<typeof batchTrashBodySchema>;

const batchFailureSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});
export type BatchFailure = z.infer<typeof batchFailureSchema>;

export const batchRestorePagesResponseSchema = z.object({
  restored: z.array(z.string().min(1)),
  failed: z.array(batchFailureSchema),
});
export type BatchRestorePagesResponse = z.infer<typeof batchRestorePagesResponseSchema>;
export type BatchRestorePagesResponseData = DataWrapper<BatchRestorePagesResponse>;
