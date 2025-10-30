import { z } from 'zod';
import { dataViewSchema } from '../../schemas/entities/data-view';
import type { DataWrapper } from '../utilities';
import { getDataViewsResponseSchema } from './get-data-views';

// Define the endpoint path
export const CREATE_DATA_VIEW_ENDPOINT = '/views';

// Create data view
export const createDataViewBodySchema = dataViewSchema
  .pick({
    name: true,
    dataSourceId: true,
  })
  .extend({
    pageId: z.string().min(1).optional(),
  });

export const createDataViewResponseSchema = getDataViewsResponseSchema.element;
export type CreateDataViewBody = z.infer<typeof createDataViewBodySchema>;
export type CreateDataViewResponse = z.infer<typeof createDataViewResponseSchema>;
export type CreateDataViewResponseData = DataWrapper<CreateDataViewResponse>;
