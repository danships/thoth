import { z } from 'zod';
import {
  withIdSchema,
  withParentIdSchema,
  withTrackUpdatesSchema,
  withUserIdSchema,
  withWorkspaceIdSchema,
} from '../utilities';
import { blockSchema } from '../blocks';

export const stringValueSchema = z.object({ type: z.literal('string'), value: z.string() });
export const numberValueSchema = z.object({ type: z.literal('number'), value: z.number() });
export const booleanValueSchema = z.object({ type: z.literal('boolean'), value: z.boolean() });

// Value union used for page values
export const pageValueSchema = z.discriminatedUnion('type', [stringValueSchema, numberValueSchema, booleanValueSchema]);
export type PageValue = z.infer<typeof pageValueSchema>;

const baseColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const stringColumnSchema = baseColumnSchema.extend({ type: z.literal('string') });
export const numberColumnSchema = baseColumnSchema.extend({ type: z.literal('number') });
export const booleanColumnSchema = baseColumnSchema.extend({ type: z.literal('boolean') });

// Column union used for data source columns
export const columnSchema = z.discriminatedUnion('type', [stringColumnSchema, numberColumnSchema, booleanColumnSchema]);
export type Column = z.infer<typeof columnSchema>;

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
    values: z.record(z.string(), pageValueSchema).optional(),
  })
  .extend(withParentIdSchema.shape);

export const dataSourceContainerSchema = containerSchema
  .extend({
    type: z.literal('data-source'),
    columns: z.array(columnSchema),
  })
  .extend(withParentIdSchema.shape);
