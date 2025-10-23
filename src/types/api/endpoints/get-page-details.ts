import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';

export const GET_PAGE_DETAILS_ENDPOINT = '/pages/:id';

export const getPageDetailsResponseSchema = z.object({
  page: pageSchema,
});

export type GetPageDetailsResponse = z.infer<typeof getPageDetailsResponseSchema>;
export type GetPageDetailsResponseData = DataWrapper<GetPageDetailsResponse>;

export const getPageDetailsParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetPageDetailsParameters = z.infer<typeof getPageDetailsParametersSchema>;
