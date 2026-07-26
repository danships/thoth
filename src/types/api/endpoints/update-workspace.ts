import { z } from 'zod';
import { workspaceSchema } from '../entities';
import { workspaceSlugSchema } from '../../schemas/entities/workspace';
import type { DataWrapper } from '../utilities';

export const UPDATE_WORKSPACE_ENDPOINT = (id: string) => `/workspaces/${id}`;

export const updateWorkspaceParametersSchema = z.object({
  id: z.string().min(1),
});
export type UpdateWorkspaceParameters = z.infer<typeof updateWorkspaceParametersSchema>;

export const updateWorkspaceBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: workspaceSlugSchema.optional(),
});
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;

export const updateWorkspaceResponseSchema = workspaceSchema;
export type UpdateWorkspaceResponse = z.infer<typeof updateWorkspaceResponseSchema>;
export type UpdateWorkspaceResponseData = DataWrapper<UpdateWorkspaceResponse>;

export const deleteWorkspaceParametersSchema = updateWorkspaceParametersSchema;
export type DeleteWorkspaceParameters = z.infer<typeof deleteWorkspaceParametersSchema>;

export const restoreWorkspaceParametersSchema = updateWorkspaceParametersSchema;
export type RestoreWorkspaceParameters = z.infer<typeof restoreWorkspaceParametersSchema>;

export const restoreWorkspaceResponseSchema = workspaceSchema;
export type RestoreWorkspaceResponse = z.infer<typeof restoreWorkspaceResponseSchema>;
export type RestoreWorkspaceResponseData = DataWrapper<RestoreWorkspaceResponse>;
