import { z } from 'zod';
import {
  booleanColumnSchema,
  dataSourceContainerSchema,
  numberColumnSchema,
  stringColumnSchema,
} from '../../schemas/entities/container';
import type { DataWrapper } from '../utilities';
import { getDataSourcesResponseSchema } from './get-data-sources';

// Define the endpoint path
export const CREATE_DATA_SOURCE_ENDPOINT = '/data-sources';

// Create data source
export const createDataSourceBodySchema = dataSourceContainerSchema
  .pick({
    name: true,
  })
  .extend({
    columns: z
      .array(
        z.discriminatedUnion('type', [
          stringColumnSchema.omit({ id: true }),
          numberColumnSchema.omit({ id: true }),
          booleanColumnSchema.omit({ id: true }),
        ])
      )
      .optional(),
  });

export const createDataSourceResponseSchema = getDataSourcesResponseSchema.element;
export type CreateDataSourceBody = z.infer<typeof createDataSourceBodySchema>;
export type CreateDataSourceResponse = z.infer<typeof createDataSourceResponseSchema>;
export type CreateDataSourceResponseData = DataWrapper<CreateDataSourceResponse>;
