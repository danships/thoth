import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withWorkspaceIdSchema } from '../utilities';
import { workspaceSlugSchema } from './workspace';

export const workspaceSlugRedirectSchema = z
  .object({
    slug: workspaceSlugSchema,
  })
  .extend(z.object({ createdAt: withTrackUpdatesSchema.shape.createdAt }).shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withIdSchema.shape);
