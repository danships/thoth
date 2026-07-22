import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { columnSchema, dateModeSchema, selectColorSchema } from '../../schemas/entities/container';

export const CREATE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns';

export const createDataSourceColumnBodySchema = z.discriminatedUnion('type', [
  z.object({ name: z.string().min(1), type: z.literal('string') }),
  z.object({ name: z.string().min(1), type: z.literal('number') }),
  z.object({ name: z.string().min(1), type: z.literal('boolean') }),
  z.object({
    name: z.string().min(1),
    type: z.literal('date'),
    mode: dateModeSchema,
    displayFormat: z.string().min(1),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal('single-select'),
    // No `id` — the server assigns one, matching the existing pattern for the column's own id.
    options: z.array(z.object({ label: z.string().trim().min(1), color: selectColorSchema })).default([]),
  }),
]);
export type CreateDataSourceColumnBody = z.infer<typeof createDataSourceColumnBodySchema>;

export const createDataSourceColumnResponseSchema = columnSchema;
export type CreateDataSourceColumnResponse = z.infer<typeof createDataSourceColumnResponseSchema>;
export type CreateDataSourceColumnResponseData = DataWrapper<CreateDataSourceColumnResponse>;

export const createDataSourceColumnParametersSchema = z.object({ id: z.string().min(1) });
export type CreateDataSourceColumnParameters = z.infer<typeof createDataSourceColumnParametersSchema>;
