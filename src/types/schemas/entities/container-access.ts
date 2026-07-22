import { z } from 'zod';
import { withIdSchema, withParentIdSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';

// `ContainerAccess` tracks a per-`(userId, containerId)` "last accessed" fact — it doesn't
// track "last updated" in the general sense the other entities do (`withTrackUpdatesSchema`),
// so `createdAt` is declared directly here rather than pulling in that shared shape.
export const containerAccessSchema = z
  .object({
    containerId: z.string().min(1),
    lastAccessedAt: z.iso.datetime({ offset: true }),
    createdAt: z.string(),
  })
  .extend(withParentIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withIdSchema.shape);

export type ContainerAccessSchema = z.infer<typeof containerAccessSchema>;
