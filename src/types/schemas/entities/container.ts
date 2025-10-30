import { z } from 'zod';
import {
  withIdSchema,
  withParentIdSchema,
  withTrackUpdatesSchema,
  withUserIdSchema,
  withWorkspaceIdSchema,
} from '../utilities';
import { blockSchema } from '../blocks';

export const containerSchema = z
  .object({
    name: z.string().min(1),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export const pageContainerSchema = containerSchema
  .extend({
    type: z.literal('page'),
    emoji: z.string().min(1).nullable(),
    // TODO generate/get block validation schemas for blocks
    blocks: z.array(blockSchema).optional(),
    views: z.array(z.string()).optional(),
  })
  .extend(withParentIdSchema.shape);

export const dataSourceContainerSchema = containerSchema
  .extend({
    type: z.literal('data-source'),
  })
  .extend(withParentIdSchema.shape);
