import type { z } from 'zod';
import { pageSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Define the endpoint path
export const CREATE_WELCOME_PAGE_ENDPOINT = '/pages/welcome';

// Define response schema — reuses the same shape as a regular page
export const createWelcomePageResponseSchema = pageSchema;

// Export types
export type CreateWelcomePageResponse = z.infer<typeof createWelcomePageResponseSchema>;
export type CreateWelcomePageResponseData = DataWrapper<CreateWelcomePageResponse>;
