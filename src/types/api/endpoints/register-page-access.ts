import { z } from 'zod';
import { containerAccessSchema } from '../entities';
import type { DataWrapper } from '../utilities';

export const POST_PAGE_ACCESS_ENDPOINT = '/pages/:id/access';

export const registerPageAccessParametersSchema = z.object({
  id: z.string().min(1),
});
export type RegisterPageAccessParameters = z.infer<typeof registerPageAccessParametersSchema>;

export const registerPageAccessResponseSchema = containerAccessSchema;

export type RegisterPageAccessResponse = z.infer<typeof registerPageAccessResponseSchema>;
export type RegisterPageAccessResponseData = DataWrapper<RegisterPageAccessResponse>;
