import type { z } from 'zod';
import type { JobDisposition } from './envelope.js';

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

/** Result of asking the runner to enqueue a child job from within a handler (THOTH-061). */
export type EnqueueChildResult = { jobId: string; disposition: JobDisposition };

/** Enqueues another *internal* job type directly (in-process — never over the IPC socket). */
export type EnqueueChildFunction = (input: {
  type: string;
  payloadVersion: number;
  payload: unknown;
  dedupeKey?: string;
}) => Promise<EnqueueChildResult>;

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
  /** Enqueues a child internal job (e.g. `webhook.dispatch` fanning out to `webhook.deliver`). */
  enqueueChild: EnqueueChildFunction;
};

/**
 * Thrown by a handler to request a retry with computed backoff instead of a permanent failure.
 * `retryAfterMs`, when set, overrides the runner's own generic backoff calculation for this one
 * retry — used by the webhook deliver handler to honour a receiver's `Retry-After` header
 * (bounded by the queue's backoff cap regardless).
 */
export class RetryableJobError extends Error {
  public override readonly cause?: unknown;
  public readonly retryAfterMs: number | undefined;

  constructor(message: string, options?: { cause?: unknown; retryAfterMs?: number }) {
    super(message);
    this.name = 'RetryableJobError';
    this.cause = options?.cause;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export type JobHandler<TPayload> = (context: JobExecutionContext<TPayload>) => Promise<unknown>;

/**
 * Optional per-type coalescing policy (THOTH-061). When a new request shares an already-`queued`
 * job's dedupe key, `merge` combines the two payloads (e.g. earliest `previous`/latest `new`
 * value-change semantics) instead of simply replacing the queued payload, and the resulting
 * `runAt` is `min(firstQueuedAt + maxDebounceMs, now + debounceMs)` — a trailing debounce with an
 * absolute cap so a continuously-edited page still dispatches within `maxDebounceMs`.
 */
export type JobCoalescePolicy<TPayload> = {
  debounceMs: number;
  maxDebounceMs: number;
  merge: (existing: TPayload, incoming: TPayload) => TPayload;
};

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
  coalesce?: JobCoalescePolicy<TPayload>;
  handler: JobHandler<TPayload>;
};
