import { z } from 'zod';

export const FORK_PAGE_REVISION_ENDPOINT = '/pages/:id/history/:revisionId/fork';

export const forkPageRevisionParametersSchema = z.object({
  id: z.string().min(1),
  revisionId: z.string().min(1),
});
export type ForkPageRevisionParameters = z.infer<typeof forkPageRevisionParametersSchema>;

export const forkPageRevisionBodySchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
});
export type ForkPageRevisionBody = z.infer<typeof forkPageRevisionBodySchema>;

export const forkPageRevisionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  createdAt: z.string(),
  lastUpdated: z.string(),
});
export type ForkPageRevisionResponse = z.infer<typeof forkPageRevisionResponseSchema>;
