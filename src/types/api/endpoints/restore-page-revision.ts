import { z } from 'zod';
import { pageRevisionTargetSchema } from '../../schemas/entities/page-revision';

export const RESTORE_PAGE_REVISION_ENDPOINT = '/pages/:id/history/:revisionId/restore';

export const restorePageRevisionParametersSchema = z.object({
  id: z.string().min(1),
  revisionId: z.string().min(1),
});
export type RestorePageRevisionParameters = z.infer<typeof restorePageRevisionParametersSchema>;

export const restorePageRevisionResponseSchema = z.object({
  target: pageRevisionTargetSchema,
  sequence: z.number().int(),
});
export type RestorePageRevisionResponse = z.infer<typeof restorePageRevisionResponseSchema>;
