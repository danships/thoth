import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema } from '../utilities';

// URL-safe, globally unique identifier used as the workspace's URL prefix. Allowed chars
// `[a-z0-9-]`, 3-50 chars, must start/end alphanumeric, no consecutive hyphens.
export const workspaceSlugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with single hyphens between segments');

export const workspaceSchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: workspaceSlugSchema,
    deletedAt: z.string().nullable(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
