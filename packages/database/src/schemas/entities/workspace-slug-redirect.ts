import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withWorkspaceIdSchema } from '../utilities.js';
import { workspaceSlugSchema } from './workspace.js';

export const workspaceSlugRedirectSchema = z
  .object({
    slug: workspaceSlugSchema,
  })
  .extend(z.object({ createdAt: withTrackUpdatesSchema.shape.createdAt }).shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withIdSchema.shape);
