import { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const CREATE_WELCOME_PAGE_ENDPOINT = '/pages/welcome';

// Define response schema — reuses the same shape as a regular page
export const createWelcomePageResponseSchema = pageSchema;

// Export types
export type CreateWelcomePageResponse = z.infer<typeof createWelcomePageResponseSchema>;
export type CreateWelcomePageResponseData = DataWrapper<CreateWelcomePageResponse>;

// `workspaceId` is optional: when omitted, the handler falls back to the caller's default
// workspace (see `resolveDefaultWorkspaceId`) for backwards compatibility. The body itself may
// also be entirely absent (no request body sent), which is why the schema must accept an
// `undefined` object too.
export const createWelcomePageBodySchema = z
  .object({
    workspaceId: z.string().min(1).optional(),
  })
  .optional();
export type CreateWelcomePageBody = z.infer<typeof createWelcomePageBodySchema>;
