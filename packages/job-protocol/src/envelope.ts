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
  // THOTH-086: the workspace search model/index could not be loaded, or the bounded search
  // request timed out — the web process maps this to a 503 with a fixed, non-revealing message.
  'SEARCH_UNAVAILABLE',
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

export const JobStatusSchema = z.enum(['queued', 'running', 'completed', 'dead']);
export type JobStatusValue = z.infer<typeof JobStatusSchema>;

/**
 * `status`: test-only lookup of an in-process job's current lifecycle state by `jobId` (see
 * `external-job.ts` — only reachable when `NODE_ENV === 'test'`). Lets integration tests wait for
 * a specific enqueued job's terminal state (`completed`/`dead`) instead of polling side effects
 * that may be true before the job has actually run.
 */
export const StatusRequestEnvelopeSchema = z
  .object({
    version: z.literal(JOB_PROTOCOL_VERSION),
    requestId: z.uuid(),
    kind: z.literal('status'),
    jobId: z.string().min(1).max(200),
  })
  .strict();

export type StatusRequestEnvelope = z.infer<typeof StatusRequestEnvelopeSchema>;

/**
 * `search`: a non-queued, synchronous request (THOTH-086) — unlike `enqueue`, this is answered
 * directly by `WorkspaceSearchService.search` rather than going through the durable job queue,
 * since a search result is only useful to the caller that's still waiting for it. The `grant` is
 * a strict, bounded `AccessGrant` snapshot (never a session/user id) resolved by the web process
 * before the request is sent; `@thoth/jobs` re-validates `grant.workspaceId === workspaceId`.
 */
const MAX_SCOPED_CONTAINER_IDS = 5000;

export const SearchAccessGrantSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    permission: z.enum(['read', 'read_write']),
    scopeType: z.enum(['workspace', 'containers', 'containers_with_children']),
    scopedContainerIds: z.array(z.string().min(1).max(200)).max(MAX_SCOPED_CONTAINER_IDS).optional(),
  })
  .strict();
export type SearchAccessGrant = z.infer<typeof SearchAccessGrantSchema>;

export const SearchRequestEnvelopeSchema = z
  .object({
    version: z.literal(JOB_PROTOCOL_VERSION),
    requestId: z.uuid(),
    kind: z.literal('search'),
    workspaceId: z.string().min(1).max(200),
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(20),
    grant: SearchAccessGrantSchema,
  })
  .strict();
export type SearchRequestEnvelope = z.infer<typeof SearchRequestEnvelopeSchema>;

export const JobRequestEnvelopeSchema = z.discriminatedUnion('kind', [
  EnqueueJobRequestEnvelopeSchema,
  PingRequestEnvelopeSchema,
  StatusRequestEnvelopeSchema,
  SearchRequestEnvelopeSchema,
]);

export type JobRequestEnvelope = z.infer<typeof JobRequestEnvelopeSchema>;

export const JobDispositionSchema = z.enum(['created', 'coalesced']);
export type JobDisposition = z.infer<typeof JobDispositionSchema>;

/** One ranked match returned by `WorkspaceSearchService.search` (THOTH-086). Deliberately
 * carries only identifiers/score/snippet — `page` presentation fields (name, emoji, parentId)
 * are always reloaded from the current database row by the web process, never trusted from the
 * index. */
export const SearchResultSchema = z
  .object({
    pageId: z.string().min(1).max(200),
    score: z.number(),
    snippet: z.string().max(1000),
  })
  .strict();
export type SearchResult = z.infer<typeof SearchResultSchema>;

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
        // Only populated for `status` responses; `found: false` means the job is unknown to this
        // process (never enqueued here, or its in-memory record has already been reaped).
        found: z.boolean().optional(),
        status: JobStatusSchema.optional(),
        // Only populated for `search` responses (THOTH-086).
        searchResults: z.array(SearchResultSchema).optional(),
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
