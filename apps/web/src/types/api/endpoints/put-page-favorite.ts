import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const PUT_PAGE_FAVORITE_ENDPOINT = '/pages/:id/favorite';

export const putPageFavoriteParametersSchema = z.object({
  id: z.string().min(1),
});
export type PutPageFavoriteParameters = z.infer<typeof putPageFavoriteParametersSchema>;

export const putPageFavoriteBodySchema = z.object({
  starred: z.boolean(),
});
export type PutPageFavoriteBody = z.infer<typeof putPageFavoriteBodySchema>;

export const putPageFavoriteResponseSchema = z.object({
  id: z.string(),
  containerId: z.string(),
  starred: z.boolean(),
  starredAt: z.iso.datetime({ offset: true }).nullable(),
  lastAccessedAt: z.iso.datetime({ offset: true }),
});
export type PutPageFavoriteResponse = z.infer<typeof putPageFavoriteResponseSchema>;
export type PutPageFavoriteResponseData = DataWrapper<PutPageFavoriteResponse>;
