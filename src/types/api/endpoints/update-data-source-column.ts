import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { columnSchema } from '@/types/schemas/entities';

export const UPDATE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns/:columnId';

const updateStringColumnSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.literal('string'),
});

const updateNumberColumnSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.literal('number'),
});

const updateBooleanColumnSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.literal('boolean'),
});

const updateDateColumnSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.literal('date'),
  options: z
    .object({
      dateFormat: z.string().optional(),
      includeTime: z.boolean().optional(),
    })
    .optional(),
});

// Allow updates with type specified (discriminated union)
const updateWithType = z.discriminatedUnion('type', [
  updateStringColumnSchema,
  updateNumberColumnSchema,
  updateBooleanColumnSchema,
  updateDateColumnSchema,
]);

// Allow updates without type (just name - options require type to be specified)
const updateWithoutType = z.object({
  name: z.string().min(1),
});

export const updateDataSourceColumnBodySchema = z
  .union([updateWithType, updateWithoutType])
  .refine((object) => Object.keys(object).length > 0, { message: 'No updates provided' });

export type UpdateDataSourceColumnBody = z.infer<typeof updateDataSourceColumnBodySchema>;

export const updateDataSourceColumnResponseSchema = columnSchema;
export type UpdateDataSourceColumnResponse = z.infer<typeof updateDataSourceColumnResponseSchema>;
export type UpdateDataSourceColumnResponseData = DataWrapper<UpdateDataSourceColumnResponse>;

export const updateDataSourceColumnParametersSchema = z.object({
  id: z.string().min(1),
  columnId: z.string().min(1),
});
export type UpdateDataSourceColumnParameters = z.infer<typeof updateDataSourceColumnParametersSchema>;
