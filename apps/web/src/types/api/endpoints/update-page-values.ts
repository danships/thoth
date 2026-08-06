import { z } from 'zod';
import { pageValueSchema } from '../../schemas/entities/container';

export const UPDATE_PAGE_VALUES_ENDPOINT = '/pages/:id/values';

export const updatePageValuesBodySchema = z.record(z.string(), pageValueSchema);
export type UpdatePageValuesBody = z.infer<typeof updatePageValuesBodySchema>;

export const updatePageValuesParametersSchema = z.object({ id: z.string().min(1) });
export type UpdatePageValuesParameters = z.infer<typeof updatePageValuesParametersSchema>;
