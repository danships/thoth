import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { selectColorSchema, singleSelectOptionSchema } from '@/types/schemas/entities';

export const CREATE_SINGLE_SELECT_OPTION_ENDPOINT = '/data-sources/:id/columns/:columnId/options';

export const createSingleSelectOptionBodySchema = z.object({
  label: z.string().min(1),
  color: selectColorSchema,
});
export type CreateSingleSelectOptionBody = z.infer<typeof createSingleSelectOptionBodySchema>;

export const createSingleSelectOptionResponseSchema = singleSelectOptionSchema;
export type CreateSingleSelectOptionResponse = z.infer<typeof createSingleSelectOptionResponseSchema>;
export type CreateSingleSelectOptionResponseData = DataWrapper<CreateSingleSelectOptionResponse>;

export const createSingleSelectOptionParametersSchema = z.object({
  id: z.string().min(1),
  columnId: z.string().min(1),
});
export type CreateSingleSelectOptionParameters = z.infer<typeof createSingleSelectOptionParametersSchema>;
