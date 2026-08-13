import { randomUUID } from 'node:crypto';
import type { JobDisposition, JobCoalescePolicy } from '@thoth/job-protocol';
import { QueueStore } from './queue-store';
import type { JobRecord } from './types';

export type EnqueueInput = {
  type: string;
  payloadVersion: number;
  payload: unknown;
  priority: number;
  maxAttempts: number;
  dedupeKey?: string;
  runAt?: Date;
  /** Per-type coalescing policy (THOTH-061) — see `JobCoalescePolicy` for semantics. */
  coalesce?: JobCoalescePolicy<unknown>;
};

export type EnqueueResult = {
  record: JobRecord;
  disposition: JobDisposition;
};

const LEGAL_TRANSITIONS: Record<JobRecord['status'], JobRecord['status'][]> = {
  queued: ['running'],
  running: ['completed', 'dead', 'queued'],
  completed: [],
  dead: [],
};

function assertLegalTransition(from: JobRecord['status'], to: JobRecord['status']): void {
  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Illegal job status transition: ${from} -> ${to}`);
  }
}

/**
 * Owns all policy/state validation for the in-memory queue (THOTH-059). Only the transitions
 * `queued -> running -> completed|dead` and `running -> queued` (retry) are permitted; there is
 * intentionally no generic `setStatus` escape hatch. All mutating methods are serialised through
 * a single promise chain so concurrent callers (the socket server accepting a new connection
 * while the runner claims a job) never interleave.
 */
export class QueueService {
  private readonly store = new QueueStore();
  private mutex: Promise<unknown> = Promise.resolve();

  private serialize<T>(operation: () => T): Promise<T> {
    const result = this.mutex.then(operation);
    // Swallow rejections in the chain itself (still propagated to the caller via `result`) so a
    // single failed operation never wedges the mutex for subsequent callers.
    this.mutex = result.catch(() => undefined);
    return result;
  }

  public async enqueue(input: EnqueueInput, now: Date = new Date()): Promise<EnqueueResult> {
    return this.serialize(() => {
      if (input.dedupeKey) {
        const existing = this.store.findActiveByDedupeKey(input.dedupeKey);
        if (existing) {
          if (input.coalesce) {
            existing.payload = input.coalesce.merge(existing.payload, input.payload);
            const cappedRunAt = existing.createdAt.getTime() + input.coalesce.maxDebounceMs;
            const debouncedRunAt = now.getTime() + input.coalesce.debounceMs;
            existing.runAt = new Date(Math.min(cappedRunAt, debouncedRunAt));
          } else {
            existing.payload = input.payload;
            existing.runAt = input.runAt ?? existing.runAt;
          }
          existing.payloadVersion = input.payloadVersion;
          existing.updatedAt = now;
          this.store.set(existing);
          return { record: existing, disposition: 'coalesced' as const };
        }
      }

      const initialRunAt = input.runAt ?? (input.coalesce ? new Date(now.getTime() + input.coalesce.debounceMs) : now);

      const record = this.store.create({
        id: randomUUID(),
        type: input.type,
        payloadVersion: input.payloadVersion,
        payload: input.payload,
        priority: input.priority,
        maxAttempts: input.maxAttempts,
        ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
        runAt: initialRunAt,
        now,
      });

      return { record, disposition: 'created' as const };
    });
  }

  /** Claims the single highest-priority due job, transitioning it to `running`, or `undefined`. */
  public async claimNextDue(now: Date = new Date()): Promise<JobRecord | undefined> {
    return this.serialize(() => {
      const [next] = this.store.selectDue(now);
      if (!next) {
        return undefined;
      }
      assertLegalTransition(next.status, 'running');
      next.status = 'running';
      next.attempts += 1;
      next.updatedAt = now;
      this.store.set(next);
      return next;
    });
  }

  public async complete(id: string, resultSummary: string | undefined, now: Date = new Date()): Promise<JobRecord> {
    return this.serialize(() => {
      const record = this.requireRecord(id);
      assertLegalTransition(record.status, 'completed');
      record.status = 'completed';
      if (resultSummary !== undefined) {
        record.resultSummary = resultSummary;
      }
      record.completedAt = now;
      record.updatedAt = now;
      this.store.set(record);
      return record;
    });
  }

  public async markDead(id: string, errorSummary: string | undefined, now: Date = new Date()): Promise<JobRecord> {
    return this.serialize(() => {
      const record = this.requireRecord(id);
      assertLegalTransition(record.status, 'dead');
      record.status = 'dead';
      if (errorSummary !== undefined) {
        record.errorSummary = errorSummary;
      }
      record.completedAt = now;
      record.updatedAt = now;
      this.store.set(record);
      return record;
    });
  }

  public async retry(id: string, runAt: Date, now: Date = new Date()): Promise<JobRecord> {
    return this.serialize(() => {
      const record = this.requireRecord(id);
      assertLegalTransition(record.status, 'queued');
      record.status = 'queued';
      record.runAt = runAt;
      record.updatedAt = now;
      this.store.set(record);
      return record;
    });
  }

  public async sweepRetention(maxAgeMs: number, maxCount: number, now: Date = new Date()): Promise<string[]> {
    return this.serialize(() => this.store.sweepRetention(now, maxAgeMs, maxCount));
  }

  public async hasActiveOfType(type: string): Promise<boolean> {
    return this.serialize(() => this.store.hasActiveOfType(type));
  }

  public get(id: string): JobRecord | undefined {
    return this.store.get(id);
  }

  public all(): JobRecord[] {
    return this.store.all();
  }

  private requireRecord(id: string): JobRecord {
    const record = this.store.get(id);
    if (!record) {
      throw new Error(`Unknown job id: ${id}`);
    }
    return record;
  }
}
