import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';

export const workspaceMemberRoleSchema = z.enum(['owner', 'editor', 'viewer']);

export const workspaceMemberSchema = z
  .object({
    role: workspaceMemberRoleSchema,
  })
  .extend(z.object({ createdAt: withTrackUpdatesSchema.shape.createdAt }).shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
