import { z } from 'zod';
import { pageRevisionKindSchema, pageRevisionTargetSchema } from '../../schemas/entities/page-revision';

export const GET_PAGE_HISTORY_ENDPOINT = '/pages/:id/history';

export const getPageHistoryParametersSchema = z.object({
  id: z.string().min(1),
});
export type GetPageHistoryParameters = z.infer<typeof getPageHistoryParametersSchema>;

export const getPageHistoryTargetFilterSchema = z.enum(['content', 'values', 'all']);
export type GetPageHistoryTargetFilter = z.infer<typeof getPageHistoryTargetFilterSchema>;

export const getPageHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  target: getPageHistoryTargetFilterSchema.default('all'),
});
export type GetPageHistoryQuery = z.infer<typeof getPageHistoryQuerySchema>;

// Summary row only — raw `content`/`patch`/`valuesBefore` values are never returned by the list
// endpoint (reduces payload, avoids leaking full content for revisions the caller hasn't opened).
export const pageHistoryRevisionSummarySchema = z.object({
  id: z.string(),
  sequence: z.number().int(),
  target: pageRevisionTargetSchema,
  createdAt: z.string(),
  author: z.string(),
  kind: pageRevisionKindSchema,
  consolidated: z.boolean(),
  charsAdded: z.number().int(),
  charsRemoved: z.number().int(),
  changedColumns: z.array(z.string()).optional(),
});
export type PageHistoryRevisionSummary = z.infer<typeof pageHistoryRevisionSummarySchema>;

export const getPageHistoryResponseSchema = z.object({
  revisions: z.array(pageHistoryRevisionSummarySchema),
  nextCursor: z.string().nullable(),
});
export type GetPageHistoryResponse = z.infer<typeof getPageHistoryResponseSchema>;
