import { z } from 'zod';
import { ExternalJobRequestSchema } from './external-job.js';

/**
 * Versioned request/response envelopes for the job Unix-socket IPC protocol (THOTH-059).
 *
 * Every schema is `.strict()` so unknown fields are rejected at the ingress boundary rather
 * than silently ignored — this is the primary defence against a caller smuggling extra
 * fields (priority, attempts, runAt, maxAttempts, handler names, ...) that would otherwise let
 * it influence internal scheduling/execution policy.
 */

export const JOB_PROTOCOL_VERSION = 1 as const;

export const JobErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'UNSUPPORTED_VERSION',
  'FRAME_TOO_LARGE',
  'QUEUE_UNAVAILABLE',
  'SHUTTING_DOWN',
]);

export type JobErrorCode = z.infer<typeof JobErrorCodeSchema>;

export const EnqueueJobRequestEnvelopeSchema = z
  .object({
    version: z.literal(JOB_PROTOCOL_VERSION),
    requestId: z.uuid(),
    kind: z.literal('enqueue'),
    job: ExternalJobRequestSchema,
  })
  .strict();

export type EnqueueJobRequestEnvelope = z.infer<typeof EnqueueJobRequestEnvelopeSchema>;

export const PingRequestEnvelopeSchema = z
  .object({
    version: z.literal(JOB_PROTOCOL_VERSION),
    requestId: z.uuid(),
    kind: z.literal('ping'),
  })
  .strict();

export type PingRequestEnvelope = z.infer<typeof PingRequestEnvelopeSchema>;

export const JobRequestEnvelopeSchema = z.discriminatedUnion('kind', [
  EnqueueJobRequestEnvelopeSchema,
  PingRequestEnvelopeSchema,
]);

export type JobRequestEnvelope = z.infer<typeof JobRequestEnvelopeSchema>;

export const JobDispositionSchema = z.enum(['created', 'coalesced']);
export type JobDisposition = z.infer<typeof JobDispositionSchema>;

export const JobResponseSuccessSchema = z
  .object({
    version: z.literal(JOB_PROTOCOL_VERSION),
    // Echoes whatever `requestId` the caller (or the failed parse) supplied. Kept as a bounded
    // string rather than `z.uuid()` because pre-validation failures (malformed JSON, unknown
    // fields) may need to echo a fallback marker or a caller-supplied value that itself failed
    // uuid validation.
    requestId: z.string().min(1).max(200),
    ok: z.literal(true),
    result: z
      .object({
        jobId: z.string().min(1).optional(),
        disposition: JobDispositionSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type JobResponseSuccess = z.infer<typeof JobResponseSuccessSchema>;

export const JobResponseErrorSchema = z
  .object({
    version: z.literal(JOB_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(200),
    ok: z.literal(false),
    error: z
      .object({
        code: JobErrorCodeSchema,
        message: z.string().min(1).max(500),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type JobResponseError = z.infer<typeof JobResponseErrorSchema>;

export const JobResponseEnvelopeSchema = z.union([JobResponseSuccessSchema, JobResponseErrorSchema]);

export type JobResponseEnvelope = z.infer<typeof JobResponseEnvelopeSchema>;
