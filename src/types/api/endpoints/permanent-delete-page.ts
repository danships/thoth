import { z } from 'zod';
import { updatePageParametersSchema } from './update-page';

export const PERMANENT_DELETE_PAGE_ENDPOINT = '/pages/:id/permanent';

export const permanentDeletePageParametersSchema = updatePageParametersSchema;
export type PermanentDeletePageParameters = z.infer<typeof permanentDeletePageParametersSchema>;
