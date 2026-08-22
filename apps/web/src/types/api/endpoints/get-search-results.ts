import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const GET_SEARCH_RESULTS_ENDPOINT = '/search';

export const searchResultPageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    emoji: z.string().nullable(),
    parentId: z.string().nullable(),
    isPrivate: z.boolean(),
  })
  .strict();

export const searchResultAncestorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strict();

export const searchResultSchema = z
  .object({
    page: searchResultPageSchema,
    ancestors: z.array(searchResultAncestorSchema),
    score: z.number(),
    snippet: z.string(),
  })
  .strict();

export const getSearchResultsQuerySchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    query: z.string().trim().min(1).max(100),
    type: z.literal('page'),
    limit: z.coerce.number().int().min(1).max(20),
  })
  .strict();

export const getSearchResultsResponseSchema = z
  .object({
    results: z.array(searchResultSchema),
  })
  .strict();

export type GetSearchResultsQuery = z.infer<typeof getSearchResultsQuerySchema>;
// The client-facing input shape (before Zod's `.limit` default is applied) — used by
// `apps/web/src/lib/api/client.ts` so callers can omit `limit` without duplicating the query
// contract locally.
export type GetSearchResultsQueryInput = z.input<typeof getSearchResultsQuerySchema>;
export type GetSearchResultsResponse = z.infer<typeof getSearchResultsResponseSchema>;
export type GetSearchResultsResponseData = DataWrapper<GetSearchResultsResponse>;
