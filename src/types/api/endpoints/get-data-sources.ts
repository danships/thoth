import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { dataSourceSchema } from '../entities';

// Define the endpoint path
export const GET_DATA_SOURCES_ENDPOINT = '/data-sources';

// Get data sources
export const getDataSourcesQuerySchema = z.object({
  // Optional: falls back to the caller's default workspace for backwards compatibility, but
  // callers that already know the current workspace (e.g. a page's workspace) should always
  // pass it explicitly, so the list reflects that workspace rather than the caller's
  // globally-resolved default (THOTH-042).
  workspaceId: z.string().min(1).optional(),
});
export type GetDataSourcesQuery = z.infer<typeof getDataSourcesQuerySchema>;

export const getDataSourcesResponseSchema = z.array(dataSourceSchema);
export type GetDataSourcesResponse = z.infer<typeof getDataSourcesResponseSchema>;
export type GetDataSourcesResponseData = DataWrapper<GetDataSourcesResponse>;
