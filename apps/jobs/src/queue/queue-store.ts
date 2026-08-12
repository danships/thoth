import type { CreateJobRecordInput, JobRecord } from './types';

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
      .sort((a, b) => {
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
    return this.all().some((record) => record.type === type && (record.status === 'queued' || record.status === 'running'));
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
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

    for (const [index, record] of terminal.entries()) {
      const age = now.getTime() - (record.completedAt?.getTime() ?? now.getTime());
      if (age > maxAgeMs || index >= maxCount) {
        this.records.delete(record.id);
        evicted.push(record.id);
      }
    }

    return evicted;
  }
}
