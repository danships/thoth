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

/** True only inside test runs; gates the only test-only externally-reachable job type. */
function isTestEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

const productionExternalJobSchemas = [
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
  notificationDispatchExternalJobRequestSchema,
] as const;

/**
 * The externally accepted job schema. Production environments accept exactly the three
 * externally-reachable job types (THOTH-061 webhooks + THOTH-066 notifications); test runs
 * additionally accept `test.noop` plus the internal-only `history.scan`/`history.maintain`
 * types (THOTH-062), so integration/e2e tests can drive real scan/maintenance runs through the
 * actual job service without a production "run maintenance" HTTP endpoint.
 */
export const ExternalJobRequestSchema: z.ZodType<ExternalJobRequest> = isTestEnvironment()
  ? z.discriminatedUnion('type', [
      ...productionExternalJobSchemas,
      TestNoopExternalJobRequestSchema,
      historyScanTestJobRequestSchema,
      historyMaintainTestJobRequestSchema,
    ])
  : z.discriminatedUnion('type', productionExternalJobSchemas);

export type ExternalJobRequest =
  | TestNoopExternalJobRequest
  | WebhookDispatchExternalJobRequest
  | WebhookRedeliverExternalJobRequest
  | NotificationDispatchExternalJobRequest
  | HistoryScanTestJobRequest
  | HistoryMaintainTestJobRequest;
