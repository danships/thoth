import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { columnSchema, dateModeSchema, singleSelectOptionSchema } from '@/types/schemas/entities';

export const UPDATE_DATA_SOURCE_COLUMN_ENDPOINT = '/data-sources/:id/columns/:columnId';

export const updateDataSourceColumnBodySchema = z
  .discriminatedUnion('type', [
    z.object({ name: z.string().min(1).optional(), type: z.literal('string') }),
    z.object({ name: z.string().min(1).optional(), type: z.literal('number') }),
    z.object({ name: z.string().min(1).optional(), type: z.literal('boolean') }),
    z.object({
      name: z.string().min(1).optional(),
      type: z.literal('date'),
      mode: dateModeSchema.optional(),
      displayFormat: z.string().min(1).optional(),
    }),
    z.object({
      name: z.string().min(1).optional(),
      type: z.literal('single-select'),
      // Full replace of the options array (ids included) — the client always sends the
      // complete, current options array so renames/recolors/deletes are one PATCH.
      options: z.array(singleSelectOptionSchema).optional(),
    }),
    z.object({
      name: z.string().min(1).optional(),
      type: z.literal('multi-select'),
      // Full replace of the options array (ids included) — the client always sends the
      // complete, current options array so renames/recolors/deletes are one PATCH.
      options: z.array(singleSelectOptionSchema).optional(),
    }),
  ])
  .or(z.object({ name: z.string().min(1) }))
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
