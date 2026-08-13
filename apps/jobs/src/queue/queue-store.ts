import type { CreateJobRecordInput, JobRecord } from './types.js';

/**
 * Pure in-memory store primitives for job records (THOTH-059). No mutation policy lives here —
 * `queue-service.ts` is the only module allowed to decide which transitions are legal. This
 * module just holds the `Map`, derives ordering, and answers lookups.
 */
export class QueueStore {
  private readonly records = new Map<string, JobRecord>();

  public get(id: string): JobRecord | undefined {
    return this.records.get(id);
  }

  public set(record: JobRecord): void {
    this.records.set(record.id, record);
  }

  public delete(id: string): void {
    this.records.delete(id);
  }

  public all(): JobRecord[] {
    return [...this.records.values()];
  }

  public create(input: CreateJobRecordInput): JobRecord {
    const record: JobRecord = {
      id: input.id,
      type: input.type,
      payloadVersion: input.payloadVersion,
      payload: input.payload,
      status: 'queued',
      priority: input.priority,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
      runAt: input.runAt,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.records.set(record.id, record);
    return record;
  }

  /** Finds a `queued` record sharing the given dedupe key, if any. */
  public findActiveByDedupeKey(dedupeKey: string): JobRecord | undefined {
    for (const record of this.records.values()) {
      if (record.dedupeKey === dedupeKey && record.status === 'queued') {
        return record;
      }
    }
    return undefined;
  }

  /** Returns `queued` records whose `runAt` is due, ordered by priority desc, runAt asc, createdAt asc. */
  public selectDue(now: Date): JobRecord[] {
    return this.all()
      .filter((record) => record.status === 'queued' && record.runAt.getTime() <= now.getTime())
      .toSorted((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        if (a.runAt.getTime() !== b.runAt.getTime()) {
          return a.runAt.getTime() - b.runAt.getTime();
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /** True if a non-terminal (`queued`/`running`) record of the given type exists. */
  public hasActiveOfType(type: string): boolean {
    return this.all().some(
      (record) => record.type === type && (record.status === 'queued' || record.status === 'running')
    );
  }

  /**
   * Drops terminal (`completed`/`dead`) records older than `maxAgeMs` or beyond `maxCount`,
   * keeping the most recently completed ones when trimming by count. Never touches
   * `queued`/`running` records.
   */
  public sweepRetention(now: Date, maxAgeMs: number, maxCount: number): string[] {
    const evicted: string[] = [];
    const terminal = this.all()
      .filter((record) => record.status === 'completed' || record.status === 'dead')
      .toSorted((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

    for (const [index, record] of terminal.entries()) {
      const age = now.getTime() - (record.completedAt?.getTime() ?? now.getTime());
      if (age > maxAgeMs || index >= maxCount) {
        this.records.delete(record.id);
        evicted.push(record.id);
      }
    }

    return evicted;
  }

  /**
   * Bounded, policy-driven terminal-job pruning (THOTH-063), used by the `maintenance.prune-jobs`
   * job rather than the generic in-memory hygiene sweep above: `completed` rows use
   * `completedMaxAgeMs`, `dead` rows use `deadMaxAgeMs` (defaults: at least 7 and 30 days
   * respectively — see `apps/jobs/src/environment.ts`). Never touches `queued`/`running` records.
   * `offset`/`limit` bound a single execution the same way the maintenance purge handlers do —
   * `totalEligible` lets the caller decide whether a continuation is needed.
   */
  public pruneTerminalByPolicy(
    now: Date,
    options: { completedMaxAgeMs: number; deadMaxAgeMs: number; limit: number; offset: number }
  ): { ids: string[]; totalEligible: number } {
    const eligible = this.all().filter((record) => {
      if (record.status !== 'completed' && record.status !== 'dead') {
        return false;
      }
      const age = now.getTime() - (record.completedAt?.getTime() ?? now.getTime());
      const maxAgeMs = record.status === 'completed' ? options.completedMaxAgeMs : options.deadMaxAgeMs;
      return age > maxAgeMs;
    });

    const batch = eligible.slice(options.offset, options.offset + options.limit);
    for (const record of batch) {
      this.records.delete(record.id);
    }

    return { ids: batch.map((record) => record.id), totalEligible: eligible.length };
  }
}
