import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { getDataViewParametersSchema, getDataViewResponseSchema } from './get-data-view';

export const DUPLICATE_VIEW_ENDPOINT = '/views/:id/duplicate';

export const duplicateViewParametersSchema = getDataViewParametersSchema;
export type DuplicateViewParameters = z.infer<typeof duplicateViewParametersSchema>;

export const duplicateViewBodySchema = z.object({
  pageId: z.string().min(1),
});
export type DuplicateViewBody = z.infer<typeof duplicateViewBodySchema>;

export const duplicateViewResponseSchema = getDataViewResponseSchema;
export type DuplicateViewResponse = z.infer<typeof duplicateViewResponseSchema>;
export type DuplicateViewResponseData = DataWrapper<DuplicateViewResponse>;
