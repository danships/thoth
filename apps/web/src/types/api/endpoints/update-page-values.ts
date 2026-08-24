import { z } from 'zod';
import { pageValueSchema } from '../../schemas/entities/container';

export const UPDATE_PAGE_VALUES_ENDPOINT = '/pages/:id/values';

// Values can be submitted either in their canonical form or in a compact form. The route
// resolves the compact form against the target column before persisting it.
export const updatePageValuesEntrySchema = z.union([
  pageValueSchema,
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);
export type UpdatePageValuesEntry = z.infer<typeof updatePageValuesEntrySchema>;

export const updatePageValuesBodySchema = z.record(z.string(), updatePageValuesEntrySchema);
export type UpdatePageValuesBody = z.infer<typeof updatePageValuesBodySchema>;

export const updatePageValuesParametersSchema = z.object({ id: z.string().min(1) });
export type UpdatePageValuesParameters = z.infer<typeof updatePageValuesParametersSchema>;
