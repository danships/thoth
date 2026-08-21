import { z } from 'zod';
import type { JobCoalescePolicy } from './registry.js';

/**
 * Job payloads for THOTH-086 semantic workspace search.
 *
 * `search.sync-page` is externally reachable (production): web mutation routes enqueue it after
 * a durable page create/update, carrying only identifiers (never content/session/grant data) —
 * mirrors `webhook.dispatch` (see `webhook-job.ts`).
 *
 * `search.reconcile-workspace` has two payload shapes: the *internal* one (`...PayloadV1Schema`,
 * used as the job's `JobDefinition.payloadSchema` and by `@thoth/jobs`' own continuation
 * fan-out via `context.enqueueChild`) accepts an optional `cursor`; the *production external*
 * one (`...ExternalPayloadV1Schema`) accepts only `{ workspaceId }` so a web caller can never
 * choose/replay an arbitrary continuation point.
 *
 * `search.scan-workspaces` is internal-only, mirroring `history.scan` (see `history-job.ts`) —
 * never reachable over the external protocol in production, only exposed to the discriminated
 * union under `NODE_ENV === 'test'` so integration tests can drive a real scan through the
 * actual job service without a production "run maintenance" HTTP endpoint.
 */

export const searchCursorSchema = z
  .object({
    createdAt: z.string().min(1).max(100),
    id: z.string().min(1).max(200),
  })
  .strict();
export type SearchCursor = z.infer<typeof searchCursorSchema>;

export const searchSyncPagePayloadV1Schema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    pageId: z.string().min(1).max(200),
  })
  .strict();
export type SearchSyncPagePayloadV1 = z.infer<typeof searchSyncPagePayloadV1Schema>;

export const searchSyncPageExternalJobRequestSchema = z
  .object({
    type: z.literal('search.sync-page'),
    payloadVersion: z.literal(1),
    payload: searchSyncPagePayloadV1Schema,
  })
  .strict();
export type SearchSyncPageExternalJobRequest = z.infer<typeof searchSyncPageExternalJobRequestSchema>;

export function searchSyncPageDedupeKey(payload: { workspaceId: string; pageId: string }): string {
  return `search:page:${JSON.stringify([payload.workspaceId, payload.pageId])}`;
}

export const searchReconcileWorkspacePayloadV1Schema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    cursor: searchCursorSchema.optional(),
  })
  .strict();
export type SearchReconcileWorkspacePayloadV1 = z.infer<typeof searchReconcileWorkspacePayloadV1Schema>;

export const searchReconcileWorkspaceExternalPayloadV1Schema = z
  .object({
    workspaceId: z.string().min(1).max(200),
  })
  .strict();
export type SearchReconcileWorkspaceExternalPayloadV1 = z.infer<
  typeof searchReconcileWorkspaceExternalPayloadV1Schema
>;

export const searchReconcileWorkspaceExternalJobRequestSchema = z
  .object({
    type: z.literal('search.reconcile-workspace'),
    payloadVersion: z.literal(1),
    payload: searchReconcileWorkspaceExternalPayloadV1Schema,
  })
  .strict();
export type SearchReconcileWorkspaceExternalJobRequest = z.infer<
  typeof searchReconcileWorkspaceExternalJobRequestSchema
>;

/** Test-only request shape accepting the full internal payload (with `cursor`) so tests can
 * drive a specific continuation batch directly through the job service. */
export const searchReconcileWorkspaceTestJobRequestSchema = z
  .object({
    type: z.literal('search.reconcile-workspace'),
    payloadVersion: z.literal(1),
    payload: searchReconcileWorkspacePayloadV1Schema,
  })
  .strict();
export type SearchReconcileWorkspaceTestJobRequest = z.infer<typeof searchReconcileWorkspaceTestJobRequestSchema>;

export function searchReconcileWorkspaceDedupeKey(payload: { workspaceId: string }): string {
  return `search:workspace:${payload.workspaceId}`;
}

function compareSearchCursor(left: SearchCursor, right: SearchCursor): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }
  return left.id.localeCompare(right.id);
}

/**
 * Merges a newly-enqueued `search.reconcile-workspace` request into an already-queued one
 * sharing the same dedupe key. `search.scan-workspaces` re-enqueues every still-existing
 * workspace on each pass using a cursor-less payload; if a prior batch's continuation is still
 * queued, a naive payload replacement (the default, coalesce-less enqueue behavior) would reset
 * progress back to the very first batch, and repeated scans could then prevent
 * `deleteStaleDocumentsUnlocked` from ever running to completion. Always keep whichever cursor
 * represents the furthest progress — an absent cursor means "no progress yet" and always loses to
 * a defined one.
 */
export function mergeSearchReconcileWorkspacePayload(
  existing: SearchReconcileWorkspacePayloadV1,
  incoming: SearchReconcileWorkspacePayloadV1
): SearchReconcileWorkspacePayloadV1 {
  if (!existing.cursor) {
    return incoming.cursor ? incoming : existing;
  }
  if (!incoming.cursor) {
    return existing;
  }
  return compareSearchCursor(incoming.cursor, existing.cursor) > 0 ? incoming : existing;
}

/**
 * `search.reconcile-workspace` coalesce policy (see `mergeSearchReconcileWorkspacePayload`).
 * Zero debounce: this only exists to preserve the furthest cursor across a coalesce, not to
 * batch/delay continuations — the merged job should still run as soon as it's next due.
 */
export const searchReconcileWorkspaceCoalescePolicy: JobCoalescePolicy<SearchReconcileWorkspacePayloadV1> = {
  debounceMs: 0,
  maxDebounceMs: 0,
  merge: mergeSearchReconcileWorkspacePayload,
};

export const searchScanWorkspacesPayloadV1Schema = z
  .object({
    cursor: searchCursorSchema.optional(),
  })
  .strict();
export type SearchScanWorkspacesPayloadV1 = z.infer<typeof searchScanWorkspacesPayloadV1Schema>;

export const searchScanWorkspacesTestJobRequestSchema = z
  .object({
    type: z.literal('search.scan-workspaces'),
    payloadVersion: z.literal(1),
    payload: searchScanWorkspacesPayloadV1Schema,
  })
  .strict();
export type SearchScanWorkspacesTestJobRequest = z.infer<typeof searchScanWorkspacesTestJobRequestSchema>;
