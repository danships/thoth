import { z } from 'zod';

export const SET_PAGE_CONTENT = '/pages/:id/content';

export const setPageContentParametersSchema = z.object({
  id: z.string().min(1),
});

export type SetPageContentParameters = z.infer<typeof setPageContentParametersSchema>;

export const setPageContentBodySchema = z.object({
  content: z.string().max(1_000_000),
});

export type SetPageContentBody = z.infer<typeof setPageContentBodySchema>;
