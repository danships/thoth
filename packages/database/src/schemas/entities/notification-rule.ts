import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities.js';

// One explicit subscription or exclusion rule owned by a human user in one workspace (THOTH-066).
// Absence of any row for a given (userId, workspaceId, containerId) key means "no explicit
// rule" — resolution falls through to a workspace-level rule, else "not subscribed". See
// `packages/database/src/notification-service.ts` for the full precedence algorithm.
//
// `workspace`/`none` rules always have `containerId: null` (the canonical workspace rule); every
// other kind is scoped to an exact page via `containerId`. `containerId: null` is intentionally
// representable directly in the schema (not a separate "workspace rule" entity) so a single
// logical-identity key `(userId, workspaceId, containerId)` covers both cases uniformly.
export const notificationRuleKindSchema = z.enum(['workspace', 'page', 'tree', 'exclude_page', 'exclude_tree']);
export type NotificationRuleKind = z.infer<typeof notificationRuleKindSchema>;

export const notificationRuleSchema = z
  .object({
    containerId: z.string().min(1).nullable(),
    kind: notificationRuleKindSchema,
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export type NotificationRuleSchema = z.infer<typeof notificationRuleSchema>;
