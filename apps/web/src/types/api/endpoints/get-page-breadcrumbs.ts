import { z } from 'zod';
import { pageSchema } from '../entities';

export const GET_PAGE_BREADCRUMBS_ENDPOINT = '/pages/:id/breadcrumbs';

export const getPageBreadcrumbsParametersSchema = z.object({
  id: z.string().min(1),
});

export type GetPageBreadcrumbsParameters = z.infer<typeof getPageBreadcrumbsParametersSchema>;

export const getPageBreadcrumbsResponseSchema = z.array(pageSchema);

export type GetPageBreadcrumbsResponse = z.infer<typeof getPageBreadcrumbsResponseSchema>;
