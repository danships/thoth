import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { dataSourceSchema } from '../entities';

// Define the endpoint path
export const GET_DATA_SOURCES_ENDPOINT = '/data-sources';

// Get data sources
export const getDataSourcesResponseSchema = z.array(dataSourceSchema);
export type GetDataSourcesResponse = z.infer<typeof getDataSourcesResponseSchema>;
export type GetDataSourcesResponseData = DataWrapper<GetDataSourcesResponse>;
