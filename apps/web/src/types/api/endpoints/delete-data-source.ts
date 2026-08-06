import { z } from 'zod';
import { getDataSourceParametersSchema } from './get-data-source';

export const DELETE_DATA_SOURCE_ENDPOINT = '/data-sources/:id';

export const deleteDataSourceParametersSchema = getDataSourceParametersSchema;
export type DeleteDataSourceParameters = z.infer<typeof deleteDataSourceParametersSchema>;
