import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';

// 'app' is an additive role (THOTH-026): assigned to the synthetic `app--<id>` owner id so
// App-attributed content can pass the standard `assertWorkspaceAccess` membership check.
export const workspaceMemberRoleSchema = z.enum(['owner', 'editor', 'viewer', 'app']);

export const workspaceMemberSchema = z
  .object({
    role: workspaceMemberRoleSchema,
  })
  .extend(z.object({ createdAt: withTrackUpdatesSchema.shape.createdAt }).shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
