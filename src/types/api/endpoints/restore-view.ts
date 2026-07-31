import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { getDataViewParametersSchema, getDataViewResponseSchema } from './get-data-view';

export const RESTORE_VIEW_ENDPOINT = '/views/:id/restore';

export const restoreViewParametersSchema = getDataViewParametersSchema;
export type RestoreViewParameters = z.infer<typeof restoreViewParametersSchema>;

export const restoreViewResponseSchema = getDataViewResponseSchema;
export type RestoreViewResponse = z.infer<typeof restoreViewResponseSchema>;
export type RestoreViewResponseData = DataWrapper<RestoreViewResponse>;
