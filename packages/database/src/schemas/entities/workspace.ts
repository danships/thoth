import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema } from '../utilities.js';

// URL-safe, globally unique identifier used as the workspace's URL prefix. Allowed chars
// `[a-z0-9-]`, 3-50 chars, must start/end alphanumeric, no consecutive hyphens.
export const workspaceSlugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with single hyphens between segments');

// Default owner-configurable storage quota for a workspace's uploaded files (THOTH-040): 50 MB.
export const DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES = 52_428_800;

export const workspaceSchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: workspaceSlugSchema,
    deletedAt: z.string().nullable(),
    // Additive field: existing rows without it default here on read, so it's backward-compatible
    // with rows created before THOTH-040.
    storageQuotaBytes: z.number().int().nonnegative().default(DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
