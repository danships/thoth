import { z } from 'zod';
import { dataSourceContainerSchema } from '../../schemas/entities/container';
import type { DataWrapper } from '../utilities';
import { getDataSourcesResponseSchema } from './get-data-sources';

// Define the endpoint path
export const CREATE_DATA_SOURCE_ENDPOINT = '/data-sources';

// Create data source
export const createDataSourceBodySchema = dataSourceContainerSchema.pick({
  name: true,
});

export const createDataSourceResponseSchema = getDataSourcesResponseSchema.element;
export type CreateDataSourceBody = z.infer<typeof createDataSourceBodySchema>;
export type CreateDataSourceResponse = z.infer<typeof createDataSourceResponseSchema>;
export type CreateDataSourceResponseData = DataWrapper<CreateDataSourceResponse>;
