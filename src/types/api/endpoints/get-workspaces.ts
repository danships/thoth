import { z } from 'zod';
import { workspaceSchema } from '../entities';
import type { DataWrapper } from '../utilities';

export const GET_WORKSPACES_ENDPOINT = '/workspaces';

export const getWorkspacesResponseSchema = z.array(workspaceSchema);
export type GetWorkspacesResponse = z.infer<typeof getWorkspacesResponseSchema>;
export type GetWorkspacesResponseData = DataWrapper<GetWorkspacesResponse>;
