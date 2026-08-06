import z from 'zod';

export const GET_PAGE_CONTENT_ENDPOINT = '/pages/:id/content';

export const getPageContentParametersSchema = z.object({
  id: z.string().min(1),
});

export type GetPageContentParameters = z.infer<typeof getPageContentParametersSchema>;

export const getPageContentResponseSchema = z.object({
  content: z.string(),
});

export type GetPageContentResponse = z.infer<typeof getPageContentResponseSchema>;
