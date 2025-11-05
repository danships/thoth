import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { columnSchema } from '../../schemas/entities/container';

export const CREATE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns';

const createStringColumnSchema = z.object({
  name: z.string().min(1),
  type: z.literal('string'),
});

const createNumberColumnSchema = z.object({
  name: z.string().min(1),
  type: z.literal('number'),
});

const createBooleanColumnSchema = z.object({
  name: z.string().min(1),
  type: z.literal('boolean'),
});

const createDateColumnSchema = z.object({
  name: z.string().min(1),
  type: z.literal('date'),
  options: z
    .object({
      dateFormat: z.string().optional(),
      includeTime: z.boolean().optional(),
    })
    .optional(),
});

export const createDataSourceColumnBodySchema = z.discriminatedUnion('type', [
  createStringColumnSchema,
  createNumberColumnSchema,
  createBooleanColumnSchema,
  createDateColumnSchema,
]);
export type CreateDataSourceColumnBody = z.infer<typeof createDataSourceColumnBodySchema>;

export const createDataSourceColumnResponseSchema = columnSchema;
export type CreateDataSourceColumnResponse = z.infer<typeof createDataSourceColumnResponseSchema>;
export type CreateDataSourceColumnResponseData = DataWrapper<CreateDataSourceColumnResponse>;

export const createDataSourceColumnParametersSchema = z.object({ id: z.string().min(1) });
export type CreateDataSourceColumnParameters = z.infer<typeof createDataSourceColumnParametersSchema>;
