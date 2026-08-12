import type { JobStatus } from '@thoth/job-protocol';

/**
 * In-memory job record (THOTH-059). This is a plain object — it is never written to a
 * database, has no `lockedAt`/`lockedBy`/`leaseExpiresAt`/`parentJobId` persistence concerns,
 * and is owned implicitly by the single in-process runner. If the process exits, every record
 * (including `queued`/`running`) simply disappears; see the Data Model / Edge Cases sections of
 * THOTH-059 for the rationale.
 */
export type JobRecord = {
  id: string;
  type: string;
  payloadVersion: number;
  payload: unknown;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  dedupeKey?: string;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  /** Bounded, sanitised summary — never the raw handler result. */
  resultSummary?: string;
  /** Bounded, sanitised summary — never a stack trace or raw error object. */
  errorSummary?: string;
};

export type CreateJobRecordInput = {
  id: string;
  type: string;
  payloadVersion: number;
  payload: unknown;
  priority: number;
  maxAttempts: number;
  dedupeKey?: string;
  runAt: Date;
  now: Date;
};
