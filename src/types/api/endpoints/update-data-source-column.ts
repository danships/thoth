import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { columnSchema } from '@/types/schemas/entities';

export const UPDATE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns/:columnId';

export const updateDataSourceColumnBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.union([z.literal('string'), z.literal('number'), z.literal('boolean')]).optional(),
  })
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
