import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const GET_SEARCH_RESULTS_ENDPOINT = '/search';

export const searchResultPageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    emoji: z.string().nullable(),
    parentId: z.string().nullable(),
  })
  .strict();

export const searchResultSchema = z
  .object({
    page: searchResultPageSchema,
    score: z.number(),
    snippet: z.string(),
  })
  .strict();

export const getSearchResultsQuerySchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    q: z.string().trim().min(1).max(500),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

export const getSearchResultsResponseSchema = z
  .object({
    results: z.array(searchResultSchema),
  })
  .strict();

export type GetSearchResultsQuery = z.infer<typeof getSearchResultsQuerySchema>;
export type GetSearchResultsResponse = z.infer<typeof getSearchResultsResponseSchema>;
export type GetSearchResultsResponseData = DataWrapper<GetSearchResultsResponse>;
