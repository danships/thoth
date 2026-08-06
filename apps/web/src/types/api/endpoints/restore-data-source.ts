import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { getDataSourceParametersSchema, getDataSourceResponseSchema } from './get-data-source';

export const RESTORE_DATA_SOURCE_ENDPOINT = '/data-sources/:id/restore';

export const restoreDataSourceParametersSchema = getDataSourceParametersSchema;
export type RestoreDataSourceParameters = z.infer<typeof restoreDataSourceParametersSchema>;

export const restoreDataSourceResponseSchema = getDataSourceResponseSchema;
export type RestoreDataSourceResponse = z.infer<typeof restoreDataSourceResponseSchema>;
export type RestoreDataSourceResponseData = DataWrapper<RestoreDataSourceResponse>;
