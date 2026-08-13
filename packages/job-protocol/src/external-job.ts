import { z } from 'zod';
import {
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
  type WebhookDispatchExternalJobRequest,
  type WebhookRedeliverExternalJobRequest,
} from './webhook-job';

/**
 * External job payload accepted over the Unix-socket IPC boundary (THOTH-059/THOTH-061).
 *
 * This is intentionally NOT the same type as the internal job registry used by the worker for
 * scheduled/maintenance jobs (purge, history, ...) — those are wired in-process by `@thoth/jobs`
 * and are never reachable from an external caller. `webhook.dispatch`/`webhook.redeliver` (added
 * in THOTH-061) ARE externally reachable — they're the only two ways `apps/web` can trigger
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
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
  webhookDispatchPayloadV1Schema,
  webhookRedeliverPayloadV1Schema,
  webhookActorSchema,
} from './webhook-job';
export type {
  WebhookDispatchExternalJobRequest,
  WebhookRedeliverExternalJobRequest,
  WebhookDispatchPayloadV1,
  WebhookRedeliverPayloadV1,
  WebhookActor,
} from './webhook-job';

/** True only inside test runs; gates the only test-only externally-reachable job type. */
function isTestEnvironment(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

const productionExternalJobSchemas = [
  webhookDispatchExternalJobRequestSchema,
  webhookRedeliverExternalJobRequestSchema,
] as const;

/**
 * The externally accepted job schema. Production environments accept exactly the two webhook
 * job types (THOTH-061); test runs additionally accept `test.noop`.
 */
export const ExternalJobRequestSchema: z.ZodType<ExternalJobRequest> = isTestEnvironment()
  ? z.discriminatedUnion('type', [...productionExternalJobSchemas, TestNoopExternalJobRequestSchema])
  : z.discriminatedUnion('type', productionExternalJobSchemas);

export type ExternalJobRequest =
  | TestNoopExternalJobRequest
  | WebhookDispatchExternalJobRequest
  | WebhookRedeliverExternalJobRequest;

