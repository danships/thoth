import { z } from 'zod';
import type { DataWrapper } from '../utilities';

export const GET_DELETED_WORKSPACES_ENDPOINT = '/workspaces/deleted';

export const deletedWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  deletedAt: z.string(),
  // Whole days left before the external purge job permanently removes this workspace.
  daysRemaining: z.number(),
});
export type DeletedWorkspace = z.infer<typeof deletedWorkspaceSchema>;

export const getDeletedWorkspacesResponseSchema = z.array(deletedWorkspaceSchema);
export type GetDeletedWorkspacesResponse = z.infer<typeof getDeletedWorkspacesResponseSchema>;
export type GetDeletedWorkspacesResponseData = DataWrapper<GetDeletedWorkspacesResponse>;
