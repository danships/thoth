import { z } from 'zod';

export const GET_AUTH_CONFIG_ENDPOINT = '/v1/config';

export const getAuthConfigResponseSchema = z.object({
  authMode: z.enum(['oidc', 'credentials']),
});

export type GetAuthConfigResponse = z.infer<typeof getAuthConfigResponseSchema>;
