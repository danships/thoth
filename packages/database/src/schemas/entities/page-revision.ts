import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities.js';

export const pageRevisionKindSchema = z.enum(['snapshot', 'patch', 'consolidated']);
export type PageRevisionKind = z.infer<typeof pageRevisionKindSchema>;

export const pageRevisionTargetSchema = z.enum(['content', 'values']);
export type PageRevisionTarget = z.infer<typeof pageRevisionTargetSchema>;

// One row per recorded/coalesced revision of a page, forming a gap-free `sequence` per
// `(containerId, target)`. `target: 'content'` rows form the diff-match-patch chain
// (snapshot/patch/consolidated, see src/lib/history); `target: 'values'` rows form a
// reverse-delta stream of `{ [columnId]: previousValue | null }` (see `valuesBefore`).
export const pageRevisionSchema = z
  .object({
    containerId: z.string().min(1),
    sequence: z.number().int().positive(),
    previousSequence: z.number().int().positive().nullable(),
    kind: pageRevisionKindSchema,
    target: pageRevisionTargetSchema,
    content: z.string().max(1_000_000),
    patch: z.string().max(2_000_000),
    // JSON-encoded `Record<string, PageValue | null>`; '' for `target: 'content'` rows.
    valuesBefore: z.string().max(1_000_000),
    author: z.string().min(1),
    charsAdded: z.number().int().nonnegative(),
    charsRemoved: z.number().int().nonnegative(),
    // ISO timestamp; while `now < coalesceWindowEnd` a same-author save updates this row
    // in-place instead of appending a new one. Irrelevant (but always populated) for
    // `target: 'values'` rows, which never coalesce.
    coalesceWindowEnd: z.string(),
    consolidated: z.boolean(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export type PageRevisionSchema = z.infer<typeof pageRevisionSchema>;
