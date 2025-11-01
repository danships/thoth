import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { columnSchema } from '../../schemas/entities/container';

export const CREATE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns';

export const createDataSourceColumnBodySchema = z.object({
  name: z.string().min(1),
  type: z.union([z.literal('string'), z.literal('number'), z.literal('boolean')]),
});
export type CreateDataSourceColumnBody = z.infer<typeof createDataSourceColumnBodySchema>;

export const createDataSourceColumnResponseSchema = columnSchema;
export type CreateDataSourceColumnResponse = z.infer<typeof createDataSourceColumnResponseSchema>;
export type CreateDataSourceColumnResponseData = DataWrapper<CreateDataSourceColumnResponse>;

export const createDataSourceColumnParametersSchema = z.object({ id: z.string().min(1) });
export type CreateDataSourceColumnParameters = z.infer<typeof createDataSourceColumnParametersSchema>;
