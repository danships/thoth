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
// ISO 8601 string; always stored in full ISO format (with time+timezone)
export const dateValueSchema = z.object({
  type: z.literal('date'),
  value: z.iso.datetime({ offset: true }),
});
// References a SingleSelectOption.id on the column, or null = unselected
export const singleSelectValueSchema = z.object({
  type: z.literal('single-select'),
  value: z.string().nullable(),
});

// Value union used for page values
export const pageValueSchema = z.discriminatedUnion('type', [
  stringValueSchema,
  numberValueSchema,
  booleanValueSchema,
  dateValueSchema,
  singleSelectValueSchema,
]);
export type PageValue = z.infer<typeof pageValueSchema>;

const baseColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const stringColumnSchema = baseColumnSchema.extend({ type: z.literal('string') });
export const numberColumnSchema = baseColumnSchema.extend({ type: z.literal('number') });
export const booleanColumnSchema = baseColumnSchema.extend({ type: z.literal('boolean') });

export const dateModeSchema = z.enum(['date', 'time', 'datetime']);
export type DateMode = z.infer<typeof dateModeSchema>;
export const dateColumnSchema = baseColumnSchema.extend({
  type: z.literal('date'),
  mode: dateModeSchema,
  displayFormat: z.string().min(1),
});

// Fixed palette of Mantine named theme colors, used so text/background contrast can be
// computed consistently via Mantine's `Badge`/`Pill` `color` prop. No freeform hex support.
export const selectColorSchema = z.enum([
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'red',
  'pink',
  'grape',
  'gray',
]);
export type SelectColor = z.infer<typeof selectColorSchema>;

export const singleSelectOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: selectColorSchema,
});
export type SingleSelectOption = z.infer<typeof singleSelectOptionSchema>;

export const singleSelectColumnSchema = baseColumnSchema.extend({
  type: z.literal('single-select'),
  options: z.array(singleSelectOptionSchema),
});

// Column union used for data source columns
export const columnSchema = z.discriminatedUnion('type', [
  stringColumnSchema,
  numberColumnSchema,
  booleanColumnSchema,
  dateColumnSchema,
  singleSelectColumnSchema,
]);
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
