import { z } from 'zod';
import { withIdSchema } from '../utilities.js';

// The credential row. `keyHash` is internal-only and must never be serialized to a client
// response — see `apiKeyPublicSchema` below, which is what every API response type is built
// from. The raw key itself is never stored anywhere.
export const apiKeySchema = z
  .object({
    appId: z.string().min(1),
    label: z.string().min(1).max(100),
    keyPrefix: z.string().min(1),
    keyHash: z.string().min(1),
    expiresAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .extend(withIdSchema.shape);

export type ApiKeySchema = z.infer<typeof apiKeySchema>;

export const apiKeyPublicSchema = apiKeySchema.omit({ keyHash: true });
export type ApiKeyPublicSchema = z.infer<typeof apiKeyPublicSchema>;
