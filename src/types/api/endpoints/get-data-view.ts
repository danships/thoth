import { z } from 'zod';
import { dataViewSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const GET_DATA_VIEW_ENDPOINT = '/views/:id';

// Get single data view
export const getDataViewResponseSchema = dataViewSchema.pick({
  id: true,
  name: true,
  lastUpdated: true,
  createdAt: true,
});
export type GetDataViewResponse = z.infer<typeof getDataViewResponseSchema>;
export type GetDataViewResponseData = DataWrapper<GetDataViewResponse>;

// Parameters for ID-based operations
export const getDataViewParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetDataViewParameters = z.infer<typeof getDataViewParametersSchema>;
