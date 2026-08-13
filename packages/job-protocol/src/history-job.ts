import { z } from 'zod';

/**
 * Internal-only page-history job payloads (THOTH-062): `history.scan` (hourly, discovers
 * distinct `(workspaceId, containerId)` pairs with revisions) and `history.maintain`
 * (per-page consolidation/retention). Neither is reachable over the external Unix-socket IPC
 * boundary in production — `external-job.ts` only adds them to the discriminated union when
 * `NODE_ENV === 'test'`, mirroring the existing `test.noop` pattern, so integration/e2e tests can
 * drive real maintenance runs through the actual job service without a production "run
 * maintenance" HTTP endpoint.
 */

export const historyScanCursorSchema = z
  .object({
    createdAt: z.string().min(1).max(100),
    id: z.string().min(1).max(200),
  })
  .strict();
export type HistoryScanCursor = z.infer<typeof historyScanCursorSchema>;

export const historyScanPayloadV1Schema = z
  .object({
    cursor: historyScanCursorSchema.optional(),
  })
  .strict();
export type HistoryScanPayloadV1 = z.infer<typeof historyScanPayloadV1Schema>;

export const historyMaintainPayloadV1Schema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    containerId: z.string().min(1).max(200),
  })
  .strict();
export type HistoryMaintainPayloadV1 = z.infer<typeof historyMaintainPayloadV1Schema>;

export const historyScanTestJobRequestSchema = z
  .object({
    type: z.literal('history.scan'),
    payloadVersion: z.literal(1),
    payload: historyScanPayloadV1Schema,
  })
  .strict();
export type HistoryScanTestJobRequest = z.infer<typeof historyScanTestJobRequestSchema>;

export const historyMaintainTestJobRequestSchema = z
  .object({
    type: z.literal('history.maintain'),
    payloadVersion: z.literal(1),
    payload: historyMaintainPayloadV1Schema,
  })
  .strict();
export type HistoryMaintainTestJobRequest = z.infer<typeof historyMaintainTestJobRequestSchema>;

/** Derives `history.maintain`'s active dedupe key: `history:<workspaceId>:<containerId>`. */
export function historyMaintainDedupeKey(payload: HistoryMaintainPayloadV1): string {
  return `history:${payload.workspaceId}:${payload.containerId}`;
}
