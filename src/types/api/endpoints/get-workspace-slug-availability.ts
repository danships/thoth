import { z } from 'zod';
import type { DataWrapper } from '../utilities';
import { workspaceSlugSchema } from '../../schemas/entities/workspace';

export const GET_WORKSPACE_SLUG_AVAILABILITY_ENDPOINT = '/workspaces/slug-availability';

export const getWorkspaceSlugAvailabilityQuerySchema = z.object({
  slug: workspaceSlugSchema,
  excludeWorkspaceId: z.string().min(1).optional(),
});
export type GetWorkspaceSlugAvailabilityQuery = z.infer<typeof getWorkspaceSlugAvailabilityQuerySchema>;

export const getWorkspaceSlugAvailabilityResponseSchema = z.object({
  available: z.boolean(),
});
export type GetWorkspaceSlugAvailabilityResponse = z.infer<typeof getWorkspaceSlugAvailabilityResponseSchema>;
export type GetWorkspaceSlugAvailabilityResponseData = DataWrapper<GetWorkspaceSlugAvailabilityResponse>;
