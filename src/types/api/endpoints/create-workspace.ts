import { z } from 'zod';
import { workspaceSchema } from '../entities';
import { workspaceSlugSchema } from '../../schemas/entities/workspace';
import type { DataWrapper } from '../utilities';

export const CREATE_WORKSPACE_ENDPOINT = '/workspaces';

export const createWorkspaceBodySchema = z.object({
  name: z.string().min(1).max(100),
  slug: workspaceSlugSchema.optional(),
});
export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;

export const createWorkspaceResponseSchema = workspaceSchema;
export type CreateWorkspaceResponse = z.infer<typeof createWorkspaceResponseSchema>;
export type CreateWorkspaceResponseData = DataWrapper<CreateWorkspaceResponse>;
