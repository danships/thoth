import { z } from 'zod';
import {
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
  type WebhookDispatchExternalJobRequest,
  type WebhookRedeliverExternalJobRequest,
} from './webhook-job.js';
import {
  historyScanTestJobRequestSchema,
  historyMaintainTestJobRequestSchema,
  type HistoryScanTestJobRequest,
  type HistoryMaintainTestJobRequest,
} from './history-job.js';
import {
  notificationDispatchExternalJobRequestSchema,
  type NotificationDispatchExternalJobRequest,
} from './notification-job.js';
import {
  searchSyncPageExternalJobRequestSchema,
  searchReconcileWorkspaceExternalJobRequestSchema,
  searchReconcileWorkspaceTestJobRequestSchema,
  searchScanWorkspacesTestJobRequestSchema,
  type SearchSyncPageExternalJobRequest,
  type SearchReconcileWorkspaceExternalJobRequest,
  type SearchReconcileWorkspaceTestJobRequest,
  type SearchScanWorkspacesTestJobRequest,
} from './search-job.js';

/**
 * External job payload accepted over the Unix-socket IPC boundary (THOTH-059/THOTH-061/THOTH-066).
 *
 * This is intentionally NOT the same type as the internal job registry used by the worker for
 * scheduled/maintenance jobs (purge, history, ...) — those are wired in-process by `@thoth/jobs`
 * and are never reachable from an external caller. `webhook.dispatch`/`webhook.redeliver` (added
 * in THOTH-061) and `notification.dispatch` (added in THOTH-066) ARE externally reachable —
 * they're the only ways `apps/web` can trigger outbound webhook delivery / durable per-user
 * inbox items, replacing every direct `fetch`/inline write that used to live in the web
 * process.
 * outbound webhook delivery, replacing every direct `fetch` that used to live in the web
 * process. Both are strict, discriminated-union-validated schemas defined in `./webhook-job` so
 * a caller can never smuggle extra fields (priority, dedupeKey, retry policy, ...) that would
 * influence internal scheduling/execution.
 *
 * A harmless internal diagnostic job (`test.noop`) is exposed only when `NODE_ENV === 'test'` so
 * integration tests can exercise the full enqueue → run → terminal-log path without depending on
 * a production job primitive being present.
 */

export const TestNoopJobPayloadSchema = z
  .object({
    // Optional short note purely for assertions in tests; never persisted long-term or logged
    // in full (see queue-service result summaries).
    note: z.string().max(200).optional(),
  })
  .strict();

export type TestNoopJobPayload = z.infer<typeof TestNoopJobPayloadSchema>;

export const TestNoopExternalJobRequestSchema = z
  .object({
    type: z.literal('test.noop'),
    payloadVersion: z.literal(1),
    payload: TestNoopJobPayloadSchema,
    // Optional dedupe key so tests can exercise enqueue coalescing over the socket.
    dedupeKey: z.string().min(1).max(200).optional(),
  })
  .strict();

export type TestNoopExternalJobRequest = z.infer<typeof TestNoopExternalJobRequestSchema>;

export {
  historyScanPayloadV1Schema,
  historyMaintainPayloadV1Schema,
  historyScanTestJobRequestSchema,
  historyMaintainTestJobRequestSchema,
  historyMaintainDedupeKey,
  historyScanCursorSchema,
} from './history-job.js';
export type {
  HistoryScanPayloadV1,
  HistoryMaintainPayloadV1,
  HistoryScanTestJobRequest,
  HistoryMaintainTestJobRequest,
  HistoryScanCursor,
} from './history-job.js';

export {
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
  webhookDispatchPayloadV1Schema,
  webhookRedeliverPayloadV1Schema,
  webhookActorSchema,
} from './webhook-job.js';
export type {
  WebhookDispatchExternalJobRequest,
  WebhookRedeliverExternalJobRequest,
  WebhookDispatchPayloadV1,
  WebhookRedeliverPayloadV1,
  WebhookActor,
} from './webhook-job.js';

export {
  notificationDispatchExternalJobRequestSchema,
  notificationDispatchPayloadV1Schema,
  notificationActorSchema,
  notificationDispatchEventSchema,
} from './notification-job.js';
export type {
  NotificationDispatchExternalJobRequest,
  NotificationDispatchPayloadV1,
  NotificationActor,
} from './notification-job.js';

export {
  searchCursorSchema,
  searchSyncPagePayloadV1Schema,
  searchSyncPageExternalJobRequestSchema,
  searchSyncPageDedupeKey,
  searchReconcileWorkspacePayloadV1Schema,
  searchReconcileWorkspaceExternalPayloadV1Schema,
  searchReconcileWorkspaceExternalJobRequestSchema,
  searchReconcileWorkspaceTestJobRequestSchema,
  searchReconcileWorkspaceDedupeKey,
  searchScanWorkspacesPayloadV1Schema,
  searchScanWorkspacesTestJobRequestSchema,
} from './search-job.js';
export type {
  SearchCursor,
  SearchSyncPagePayloadV1,
  SearchSyncPageExternalJobRequest,
  SearchReconcileWorkspacePayloadV1,
  SearchReconcileWorkspaceExternalPayloadV1,
  SearchReconcileWorkspaceExternalJobRequest,
  SearchReconcileWorkspaceTestJobRequest,
  SearchScanWorkspacesPayloadV1,
  SearchScanWorkspacesTestJobRequest,
} from './search-job.js';

/** True only inside test runs; gates the only test-only externally-reachable job type. */
function isTestEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

const productionExternalJobSchemas = [
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
  notificationDispatchExternalJobRequestSchema,
  searchSyncPageExternalJobRequestSchema,
  searchReconcileWorkspaceExternalJobRequestSchema,
] as const;

/**
 * The externally accepted job schema. Production environments accept exactly the five
 * externally-reachable job types (THOTH-061 webhooks + THOTH-066 notifications + THOTH-086
 * search sync/reconcile); test runs additionally accept `test.noop` plus the internal-only
 * `history.scan`/`history.maintain`/`search.scan-workspaces` types and the cursor-accepting
 * `search.reconcile-workspace` test variant, so integration/e2e tests can drive real
 * scan/maintenance/reconcile runs through the actual job service without a production "run
 * maintenance" HTTP endpoint.
 */
export const ExternalJobRequestSchema: z.ZodType<ExternalJobRequest> = isTestEnvironment()
  ? z.discriminatedUnion('type', [
      webhookDispatchExternalJobRequestSchema,
      webhookRedeliverExternalJobRequestSchema,
      notificationDispatchExternalJobRequestSchema,
      searchSyncPageExternalJobRequestSchema,
      // The test variant fully supersedes the restricted production `search.reconcile-workspace`
      // schema (same `type` literal) so tests may pass a `cursor` — zod's discriminated union
      // requires a unique discriminant per member, so the production one is intentionally
      // omitted from the test-mode union.
      searchReconcileWorkspaceTestJobRequestSchema,
      TestNoopExternalJobRequestSchema,
      historyScanTestJobRequestSchema,
      historyMaintainTestJobRequestSchema,
      searchScanWorkspacesTestJobRequestSchema,
    ])
  : z.discriminatedUnion('type', productionExternalJobSchemas);

export type ExternalJobRequest =
  | TestNoopExternalJobRequest
  | WebhookDispatchExternalJobRequest
  | WebhookRedeliverExternalJobRequest
  | NotificationDispatchExternalJobRequest
  | HistoryScanTestJobRequest
  | HistoryMaintainTestJobRequest
  | SearchSyncPageExternalJobRequest
  | SearchReconcileWorkspaceExternalJobRequest
  | SearchReconcileWorkspaceTestJobRequest
  | SearchScanWorkspacesTestJobRequest;

