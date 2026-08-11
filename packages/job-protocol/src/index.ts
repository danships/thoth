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
} from './envelope';
export type {
  JobErrorCode,
  EnqueueJobRequestEnvelope,
  PingRequestEnvelope,
  JobRequestEnvelope,
  JobDisposition,
  JobResponseSuccess,
  JobResponseError,
  JobResponseEnvelope,
} from './envelope';

export { ExternalJobRequestSchema, TestNoopExternalJobRequestSchema, TestNoopJobPayloadSchema } from './external-job';
export type { ExternalJobRequest, TestNoopExternalJobRequest, TestNoopJobPayload } from './external-job';

export { RetryableJobError } from './registry';
export type { JobStatus, JobExecutionContext, JobHandler, JobDefinition } from './registry';

export {
  MAX_FRAME_BYTES,
  FRAME_DELIMITER,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_RESPONSE_TIMEOUT_MS,
} from './frame';

export { JobClientError, pingJobService, enqueueJob } from './client';
export type { JobClientErrorCode, JobClientOptions } from './client';
