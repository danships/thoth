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

// There's no existing entity to derive the workspace from, so `workspaceId` is a required,
// explicit parameter here.
export const createWelcomePageBodySchema = z.object({
  workspaceId: z.string().min(1),
});
export type CreateWelcomePageBody = z.infer<typeof createWelcomePageBodySchema>;
