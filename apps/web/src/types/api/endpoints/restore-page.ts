import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';
import { updatePageParametersSchema } from './update-page';

export const RESTORE_PAGE_ENDPOINT = '/pages/:id/restore';

export const restorePageParametersSchema = updatePageParametersSchema;
export type RestorePageParameters = z.infer<typeof restorePageParametersSchema>;

export const restorePageResponseSchema = pageSchema;
export type RestorePageResponse = z.infer<typeof restorePageResponseSchema>;
export type RestorePageResponseData = DataWrapper<RestorePageResponse>;
