import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withWorkspaceIdSchema } from '../utilities.js';

export const appAttributionModeSchema = z.enum(['creator', 'app']);
export type AppAttributionMode = z.infer<typeof appAttributionModeSchema>;

export const appPermissionSchema = z.enum(['read', 'read_write']);
export type AppPermission = z.infer<typeof appPermissionSchema>;

export const appScopeTypeSchema = z.enum(['workspace', 'containers', 'containers_with_children']);
export type AppScopeType = z.infer<typeof appScopeTypeSchema>;

// A workspace-bound integration configuration ("App") that owns one or more `ApiKey` rows.
// See `src/lib/auth/access-grant.ts` for how `permission`/`scopeType` are evaluated, and
// `src/lib/database/app-service.ts` for the `attributionMode === 'app'` owner-id convention.
export const appSchema = z
  .object({
    label: z.string().min(1).max(100),
    createdByUserId: z.string().min(1),
    attributionMode: appAttributionModeSchema,
    permission: appPermissionSchema,
    scopeType: appScopeTypeSchema,
    archivedAt: z.string().nullable(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withIdSchema.shape);

export type AppSchema = z.infer<typeof appSchema>;
