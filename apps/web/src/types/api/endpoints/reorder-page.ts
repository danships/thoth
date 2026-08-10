import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const REORDER_PAGE_ENDPOINT = '/pages/:id/reorder';

export const reorderPageParametersSchema = z.object({
  id: z.string().min(1),
});
export type ReorderPageParameters = z.infer<typeof reorderPageParametersSchema>;

// Anchor by neighbour ids rather than a numeric index, so the server never has to trust or
// recompute the client's index and two clients dragging concurrently can't corrupt a shared
// counter. `beforeId`/`afterId` are the ids of the page that should end up immediately before/
// after the moved page respectively; `null` means "start of the list" / "end of the list". Both
// omitted/null is a no-op (single-item list).
export const reorderPageBodySchema = z
  .object({
    beforeId: z.string().min(1).nullable().default(null),
    afterId: z.string().min(1).nullable().default(null),
  })
  .refine((data) => !(data.beforeId && data.afterId && data.beforeId === data.afterId), {
    message: 'beforeId and afterId must not be the same page',
  });
export type ReorderPageBody = z.infer<typeof reorderPageBodySchema>;

export const reorderPageResponseSchema = pageSchema;
export type ReorderPageResponse = z.infer<typeof reorderPageResponseSchema>;
export type ReorderPageResponseData = DataWrapper<ReorderPageResponse>;
