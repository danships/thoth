import { z } from 'zod';
import { dataViewSchema } from '../../schemas/entities/data-view';
import type { DataWrapper } from '../utilities';
import { getDataViewsResponseSchema } from './get-data-views';

// Define the endpoint path
export const UPDATE_DATA_VIEW_ENDPOINT = '/views/:id';

// Base data view schema for API responses (exclude sensitive fields)
export const updateDataViewApiSchema = dataViewSchema.omit({
  userId: true,
  workspaceId: true,
});

// Update data view
export const updateDataViewBodySchema = dataViewSchema
  .pick({
    name: true,
    dataSourceId: true,
  })
  .partial();

export const updateDataViewResponseSchema = getDataViewsResponseSchema.element;
export type UpdateDataViewBody = z.infer<typeof updateDataViewBodySchema>;
export type UpdateDataViewResponse = z.infer<typeof updateDataViewResponseSchema>;
export type UpdateDataViewResponseData = DataWrapper<UpdateDataViewResponse>;

// Parameters for ID-based operations
export const updateDataViewParametersSchema = z.object({
  id: z.string().min(1),
});
export type UpdateDataViewParameters = z.infer<typeof updateDataViewParametersSchema>;
