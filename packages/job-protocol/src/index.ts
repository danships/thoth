// Public entry point for `@thoth/job-protocol` (THOTH-059). Curated so consumers (the web
// package, `@thoth/jobs`, and tests) reach package internals only through this file and the
// `./client` subpath export — never `src/**` directly.

export {
  JOB_PROTOCOL_VERSION,
  JobErrorCodeSchema,
  EnqueueJobRequestEnvelopeSchema,
  PingRequestEnvelopeSchema,
  JobRequestEnvelopeSchema,
  JobDispositionSchema,
  JobResponseSuccessSchema,
  JobResponseErrorSchema,
  JobResponseEnvelopeSchema,
} from './envelope.js';
export type {
  JobErrorCode,
  EnqueueJobRequestEnvelope,
  PingRequestEnvelope,
  JobRequestEnvelope,
  JobDisposition,
  JobResponseSuccess,
  JobResponseError,
  JobResponseEnvelope,
} from './envelope.js';

export {
  ExternalJobRequestSchema,
  TestNoopExternalJobRequestSchema,
  TestNoopJobPayloadSchema,
  historyScanPayloadV1Schema,
  historyMaintainPayloadV1Schema,
  historyScanTestJobRequestSchema,
  historyMaintainTestJobRequestSchema,
  historyMaintainDedupeKey,
  historyScanCursorSchema,
} from './external-job.js';
export type {
  ExternalJobRequest,
  TestNoopExternalJobRequest,
  TestNoopJobPayload,
  HistoryScanPayloadV1,
  HistoryMaintainPayloadV1,
  HistoryScanTestJobRequest,
  HistoryMaintainTestJobRequest,
  HistoryScanCursor,
} from './external-job.js';

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

export { RetryableJobError } from './registry.js';
export type {
  JobStatus,
  JobExecutionContext,
  JobHandler,
  JobDefinition,
  JobCoalescePolicy,
  EnqueueChildFunction,
} from './registry.js';

export {
  MAX_FRAME_BYTES,
  FRAME_DELIMITER,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_RESPONSE_TIMEOUT_MS,
} from './frame.js';

export { JobClientError, pingJobService, enqueueJob } from './client.js';
export type { JobClientErrorCode, JobClientOptions } from './client.js';
