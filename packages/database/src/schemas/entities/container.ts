import { z } from 'zod';
import {
  withIdSchema,
  withParentIdSchema,
  withTrackUpdatesSchema,
  withUserIdSchema,
  withWorkspaceIdSchema,
} from '../utilities.js';

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

// Ordered array of SingleSelectOption.id values on the column; empty array = nothing selected,
// never null (unlike single-select's nullable value).
export const multiSelectValueSchema = z.object({
  type: z.literal('multi-select'),
  value: z.array(z.string()),
});

// References an `uploaded-file`.id, or null = no file attached. Mirrors
// `singleSelectValueSchema`'s nullable single-id shape exactly (see THOTH-054) — multi-file is
// out of scope for this ticket.
export const fileValueSchema = z.object({
  type: z.literal('file'),
  value: z.string().min(1).nullable(),
});
export type FileValue = z.infer<typeof fileValueSchema>;

// Value union used for page values
export const pageValueSchema = z.discriminatedUnion('type', [
  stringValueSchema,
  numberValueSchema,
  booleanValueSchema,
  dateValueSchema,
  singleSelectValueSchema,
  multiSelectValueSchema,
  fileValueSchema,
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

// Reuses the identical option model (`singleSelectOptionSchema`) — a multi-select column only
// differs from single-select in its cell value shape (an array of option ids instead of a
// single nullable id).
export const multiSelectColumnSchema = baseColumnSchema.extend({
  type: z.literal('multi-select'),
  options: z.array(singleSelectOptionSchema),
});

// A single-uploaded-file cell (THOTH-054). No extra config, like string/number/boolean — the
// referenced `uploaded-file` carries its own filename/mimeType/size.
export const fileColumnSchema = baseColumnSchema.extend({ type: z.literal('file') });
export type FileColumn = z.infer<typeof fileColumnSchema>;

// Column union used for data source columns
export const columnSchema = z.discriminatedUnion('type', [
  stringColumnSchema,
  numberColumnSchema,
  booleanColumnSchema,
  dateColumnSchema,
  singleSelectColumnSchema,
  multiSelectColumnSchema,
  fileColumnSchema,
]);
export type Column = z.infer<typeof columnSchema>;

export const containerSchema = z
  .object({
    name: z.string().min(1),
    deletedAt: z.string().nullable(),
    deletedRootId: z.string().nullable(),
    // Opaque, lexicographically-sortable key (see `fractional-indexing`) driving manual
    // ordering within a sibling group (`workspaceId` + `parentId`, `parentId !== null` only —
    // root-level pages are never manually ordered and keep `sortOrder: null`, see THOTH-036).
    // Optional (defaults to `null`/absent) so pre-existing create/seed call sites across the
    // codebase don't all need updating; every *new* parented page is assigned one explicitly in
    // `POST /pages`.
    sortOrder: z.string().nullable().optional(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

// Normalized crop/zoom info for a page's cover image, stored as opaque JSON alongside `emoji`.
export const pageCoverSchema = z.object({
  imageUrl: z
    .url()
    .max(2048)
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
      message: 'imageUrl must use the http or https protocol',
    }),
  positionX: z.number().min(0).max(1).default(0.5),
  positionY: z.number().min(0).max(1).default(0.5),
  zoom: z.number().min(1).max(3).default(1),
});
export type PageCover = z.infer<typeof pageCoverSchema>;

export const pageContainerSchema = containerSchema
  .extend({
    type: z.literal('page'),
    emoji: z.string().min(1).nullable(),
    cover: pageCoverSchema.nullable().optional(),
    content: z.string().max(1_000_000).optional(),
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
