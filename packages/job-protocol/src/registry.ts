import type { z } from 'zod';

/**
 * Shared *type* definitions describing the internal job registry shape (THOTH-059).
 *
 * Only types live here — no executable handler code. The actual handler registry (webhooks,
 * purge, history, the THOTH-059 no-op test handler, ...) is owned and wired entirely inside
 * `@thoth/jobs`; this package only describes the contract shape so the worker's internal
 * modules agree on it. Nothing here is reachable from the external IPC boundary
 * (`external-job.ts`), which intentionally exposes a much smaller, caller-facing schema.
 */

export type JobStatus = 'queued' | 'running' | 'completed' | 'dead';

/** Minimal context handed to a job handler at execution time. */
export type JobExecutionContext<TPayload> = {
  jobId: string;
  type: string;
  payloadVersion: number;
  payload: TPayload;
  attempt: number;
  maxAttempts: number;
  signal: AbortSignal;
  now: () => Date;
};

/** Thrown by a handler to request a retry with computed backoff instead of a permanent failure. */
export class RetryableJobError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RetryableJobError';
    this.cause = cause;
  }
}

export type JobHandler<TPayload> = (context: JobExecutionContext<TPayload>) => Promise<unknown>;

/**
 * Metadata describing a single internal job type. `dedupeKey` derives the coalescing key from
 * a candidate payload — jobs sharing a key while one is still `queued` are coalesced rather
 * than duplicated (see the Data Model / Edge Cases sections of THOTH-059).
 */
export type JobDefinition<TPayload> = {
  type: string;
  payloadVersion: number;
  payloadSchema: z.ZodType<TPayload>;
  priority: number;
  maxAttempts: number;
  dedupeKey?: (payload: TPayload) => string | undefined;
  handler: JobHandler<TPayload>;
};
