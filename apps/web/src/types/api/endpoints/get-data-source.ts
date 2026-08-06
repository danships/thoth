import { z } from 'zod';
import { dataSourceSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const GET_DATA_SOURCE_ENDPOINT = '/data-sources/:id';

// Get single data source
export const getDataSourceResponseSchema = dataSourceSchema;
export type GetDataSourceResponse = z.infer<typeof getDataSourceResponseSchema>;
export type GetDataSourceResponseData = DataWrapper<GetDataSourceResponse>;

// Parameters for ID-based operations
export const getDataSourceParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetDataSourceParameters = z.infer<typeof getDataSourceParametersSchema>;
