import { z } from 'zod';
import { updatePageParametersSchema } from './update-page';

export const DELETE_PAGE_ENDPOINT = '/pages/:id';

export const deletePageParametersSchema = updatePageParametersSchema;
export type DeletePageParameters = z.infer<typeof deletePageParametersSchema>;
