import { z } from 'zod';
import { getDataViewParametersSchema } from './get-data-view';

export const DELETE_VIEW_ENDPOINT = '/views/:id';

export const deleteViewParametersSchema = getDataViewParametersSchema;
export type DeleteViewParameters = z.infer<typeof deleteViewParametersSchema>;
