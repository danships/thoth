import { z } from 'zod';

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
  return `search:page:${payload.workspaceId}:${payload.pageId}`;
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
