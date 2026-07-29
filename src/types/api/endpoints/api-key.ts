import { z } from 'zod';
import { apiKeySchema } from '../entities';
import { appParametersSchema } from './app';
import type { DataWrapper } from '../utilities';

/** POST /apps/:id/keys */
export const CREATE_API_KEY_ENDPOINT = (appId: string) => `/apps/${appId}/keys`;

export const apiKeyParametersSchema = appParametersSchema;
export type ApiKeyParameters = z.infer<typeof apiKeyParametersSchema>;

export const createApiKeyBodySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  // Must be strictly in the future — validated in the route handler (a static `.refine` can't
  // reference "now" meaningfully at parse time in a way that's testable/mockable).
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;

export const apiKeyResponseSchema = apiKeySchema;
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;

// The one-time response: `secret` is the raw key and is never retrievable again after this.
export const createApiKeyResponseSchema = apiKeySchema.extend({
  secret: z.string(),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
export type CreateApiKeyResponseData = DataWrapper<CreateApiKeyResponse>;

/** DELETE /apps/:id/keys/:keyId */
export const REVOKE_API_KEY_ENDPOINT = (appId: string, keyId: string) => `/apps/${appId}/keys/${keyId}`;

export const revokeApiKeyParametersSchema = z.object({
  id: z.string().min(1),
  keyId: z.string().min(1),
});
export type RevokeApiKeyParameters = z.infer<typeof revokeApiKeyParametersSchema>;
