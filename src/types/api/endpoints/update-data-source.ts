import { z } from 'zod';
import { dataSourceContainerSchema } from '../../schemas/entities/container';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const UPDATE_DATA_SOURCE_ENDPOINT = '/data-sources/:id';

// Update data source
export const updateDataSourceBodySchema = dataSourceContainerSchema
  .pick({
    name: true,
  })
  .partial();

export const updateDataSourceResponseSchema = dataSourceContainerSchema.pick({
  id: true,
  name: true,
  lastUpdated: true,
  createdAt: true,
});
export type UpdateDataSourceBody = z.infer<typeof updateDataSourceBodySchema>;
export type UpdateDataSourceResponse = z.infer<typeof updateDataSourceResponseSchema>;
export type UpdateDataSourceResponseData = DataWrapper<UpdateDataSourceResponse>;

// Parameters for ID-based operations
export const updateDataSourceParametersSchema = z.object({
  id: z.string().min(1),
});
export type UpdateDataSourceParameters = z.infer<typeof updateDataSourceParametersSchema>;
