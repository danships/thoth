import type { Logger } from 'winston';
import type { QueueService } from '../queue/queue-service.js';

/**
 * Code-owned interval schedule definition (THOTH-059). There is no schedule table — the current
 * occurrence key for interval `intervalMs` is `schedule:<type>:floor(now/intervalMs)` and is
 * tracked purely in memory (a set of recently-seen bucket keys). Startup and each tick ensure
 * the current bucket has been enqueued, giving one catch-up run for the current interval while
 * the process is alive; missed historical buckets are never replayed after a restart.
 */
export type ScheduleDefinition = {
  type: string;
  intervalMs: number;
  priority: number;
  maxAttempts: number;
  payloadVersion: number;
  payload: unknown;
};

export type SchedulerOptions = {
  logger: Logger;
  clock?: () => Date;
  tickIntervalMs?: number;
};

function bucketKey(type: string, intervalMs: number, now: Date): string {
  const bucket = Math.floor(now.getTime() / intervalMs);
  return `schedule:${type}:${bucket}`;
}

export class Scheduler {
  private readonly queueService: QueueService;
  private readonly schedules: ScheduleDefinition[];
  private readonly logger: Logger;
  private readonly clock: () => Date;
  private readonly tickIntervalMs: number;
  private readonly seenBuckets = new Set<string>();
  private tickTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(queueService: QueueService, schedules: ScheduleDefinition[], options: SchedulerOptions) {
    this.queueService = queueService;
    this.schedules = schedules;
    this.logger = options.logger;
    this.clock = options.clock ?? (() => new Date());
    this.tickIntervalMs = options.tickIntervalMs ?? 5000;
  }

  public start(): void {
    this.running = true;
    void this.tick();
  }

  public stop(): void {
    this.running = false;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
    }
  }

  /** Ensures the current bucket for every schedule has been enqueued. Exposed for tests. */
  public async tick(): Promise<void> {
    const now = this.clock();

    for (const schedule of this.schedules) {
      const key = bucketKey(schedule.type, schedule.intervalMs, now);
      if (this.seenBuckets.has(key)) {
        continue;
      }

      // Suppress overlap: don't enqueue another occurrence while a prior one of the same type
      // is still queued/running.
      const active = await this.queueService.hasActiveOfType(schedule.type);
      if (active) {
        continue;
      }

      this.seenBuckets.add(key);
      const result = await this.queueService.enqueue(
        {
          type: schedule.type,
          payloadVersion: schedule.payloadVersion,
          payload: schedule.payload,
          priority: schedule.priority,
          maxAttempts: schedule.maxAttempts,
        },
        now
      );

      this.logger.info('job.schedule.bucket', {
        type: schedule.type,
        bucket: key,
        jobId: result.record.id,
        disposition: result.disposition,
      });
    }

    if (this.running) {
      this.tickTimer = setTimeout(() => void this.tick(), this.tickIntervalMs);
    }
  }
}
