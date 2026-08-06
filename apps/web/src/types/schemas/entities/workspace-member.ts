import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';
import { appPermissionSchema, appScopeTypeSchema } from './app';

// 'app' is an additive role (THOTH-026): assigned to the synthetic `app--<id>` owner id so
// App-attributed content can pass the standard `assertWorkspaceAccess` membership check.
export const workspaceMemberRoleSchema = z.enum(['owner', 'editor', 'viewer', 'app']);

// `permission`/`scopeType` reuse the same enums as `App` (THOTH-042) so member and App
// capability checks flow through the identical `AccessGrant` shape and can never drift.
// `role` is retained for display/semantics only — capability is derived from these two fields.
export const workspaceMemberSchema = z
  .object({
    role: workspaceMemberRoleSchema,
    permission: appPermissionSchema,
    scopeType: appScopeTypeSchema,
  })
  .extend(z.object({ createdAt: withTrackUpdatesSchema.shape.createdAt }).shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
