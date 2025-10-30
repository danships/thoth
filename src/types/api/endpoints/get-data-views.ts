import { z } from 'zod';
import { dataViewSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const GET_DATA_VIEWS_ENDPOINT = '/views';

// Query parameters for getting views (optional filtering by data source)
export const getDataViewsQuerySchema = z.object({
  dataSourceId: z.string().min(1).optional(),
});
export type GetDataViewsQuery = z.infer<typeof getDataViewsQuerySchema>;

// Get data views
export const getDataViewsResponseSchema = z.array(dataViewSchema);
export type GetDataViewsResponse = z.infer<typeof getDataViewsResponseSchema>;
export type GetDataViewsResponseData = DataWrapper<GetDataViewsResponse>;
