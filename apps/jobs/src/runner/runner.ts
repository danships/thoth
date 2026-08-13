import type { Logger } from 'winston';
import { RetryableJobError, type JobExecutionContext } from '@thoth/job-protocol';
import type { QueueService } from '../queue/queue-service';
import type { JobRegistry } from '../handlers/registry';
import type { JobRecord } from '../queue/types';
import { computeBackoffMs } from './backoff';

export type RunnerOptions = {
  concurrency?: number;
  pollIntervalMs?: number;
  logger: Logger;
  clock?: () => Date;
  random?: () => number;
};

const MAX_SUMMARY_LENGTH = 500;

/** Truncates and stringifies a value into a bounded, log-safe summary — never a raw stack trace. */
function summarize(value: unknown): string {
  let text: string;
  if (value instanceof Error) {
    text = value.message;
  } else {
    try {
      // JSON.stringify returns `undefined` (not the string "undefined") for `undefined`,
      // functions, and symbols — fall back to `String(value)` so `.length` below never throws.
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > MAX_SUMMARY_LENGTH ? `${text.slice(0, MAX_SUMMARY_LENGTH)}…` : text;
}

/**
 * Polling runner with bounded concurrency (THOTH-059). Claims are made one at a time through
 * `QueueService` (which serialises all mutation), then executed in a pool bounded by
 * `concurrency`. `wake()` triggers an immediate poll instead of waiting for the next interval,
 * so enqueue/retry latency stays low without busy-polling.
 */
export class Runner {
  private readonly queueService: QueueService;
  private readonly registry: JobRegistry;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly logger: Logger;
  private readonly clock: () => Date;
  private readonly random: () => number;

  private running = false;
  private shuttingDown = false;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private activeCount = 0;
  private readonly activeAbortControllers = new Set<AbortController>();
  private idleWaiters: (() => void)[] = [];

  constructor(queueService: QueueService, registry: JobRegistry, options: RunnerOptions) {
    this.queueService = queueService;
    this.registry = registry;
    this.concurrency = options.concurrency ?? 4;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.logger = options.logger;
    this.clock = options.clock ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  public start(): void {
    this.running = true;
    this.schedulePoll(0);
  }

  public wake(): void {
    if (this.running && !this.shuttingDown) {
      this.schedulePoll(0);
    }
  }

  /** Stops accepting new claims and waits (up to `timeoutMs`) for active handlers to finish. */
  public async stop(timeoutMs: number): Promise<void> {
    this.shuttingDown = true;
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    if (this.activeCount === 0) {
      return;
    }

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutTimer = setTimeout(() => {
        for (const controller of this.activeAbortControllers) {
          controller.abort();
        }
        resolve();
      }, timeoutMs);
    });

    const idle = new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve);
    });

    await Promise.race([idle, timeout]);
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
  }

  private schedulePoll(delayMs: number): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      void this.pollOnce();
    }, delayMs);
  }

  private async pollOnce(): Promise<void> {
    if (!this.running || this.shuttingDown) {
      return;
    }

    while (this.activeCount < this.concurrency && this.running && !this.shuttingDown) {
      const record = await this.queueService.claimNextDue(this.clock());
      if (!record) {
        break;
      }
      this.activeCount += 1;
      void this.execute(record)
        .catch((error: unknown) => {
          this.logger.error('job.execute.unhandled', {
            jobId: record.id,
            type: record.type,
            summary: summarize(error),
          });
        })
        .finally(() => {
          this.activeCount -= 1;
          if (this.activeCount === 0 && this.shuttingDown) {
            const waiters = this.idleWaiters;
            this.idleWaiters = [];
            for (const resolve of waiters) {
              resolve();
            }
          }
        });
    }

    if (this.running && !this.shuttingDown) {
      this.schedulePoll(this.pollIntervalMs);
    }
  }

  private async execute(record: JobRecord): Promise<void> {
    const definition = this.registry.get(record.type);
    const startedAt = this.clock();
    const controller = new AbortController();
    this.activeAbortControllers.add(controller);

    if (!definition) {
      await this.queueService.markDead(record.id, `Unknown job type: ${record.type}`, this.clock());
      this.logTerminal(record, 'dead', startedAt, `Unknown job type: ${record.type}`);
      this.activeAbortControllers.delete(controller);
      return;
    }

    const payloadResult = definition.payloadSchema.safeParse(record.payload);
    if (!payloadResult.success) {
      await this.queueService.markDead(
        record.id,
        `Invalid payload for ${record.type}@${record.payloadVersion}`,
        this.clock()
      );
      this.logTerminal(record, 'dead', startedAt, 'Invalid payload');
      this.activeAbortControllers.delete(controller);
      return;
    }

    const context: JobExecutionContext<unknown> = {
      jobId: record.id,
      type: record.type,
      payloadVersion: record.payloadVersion,
      payload: payloadResult.data,
      attempt: record.attempts,
      maxAttempts: record.maxAttempts,
      signal: controller.signal,
      now: this.clock,
      enqueueChild: async (input) => {
        const childDefinition = this.registry.get(input.type);
        if (!childDefinition) {
          throw new Error(`Unknown child job type: ${input.type}`);
        }
        const result = await this.queueService.enqueue(
          {
            type: input.type,
            payloadVersion: input.payloadVersion,
            payload: input.payload,
            priority: childDefinition.priority,
            maxAttempts: childDefinition.maxAttempts,
            ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
            ...(childDefinition.coalesce === undefined ? {} : { coalesce: childDefinition.coalesce }),
          },
          this.clock()
        );
        this.wake();
        return { jobId: result.record.id, disposition: result.disposition };
      },
    };

    try {
      const result = await definition.handler(context);
      await this.queueService.complete(record.id, summarize(result), this.clock());
      this.logTerminal(record, 'completed', startedAt, summarize(result));
    } catch (error) {
      await this.handleFailure(record, error, startedAt);
    } finally {
      this.activeAbortControllers.delete(controller);
    }
  }

  private async handleFailure(record: JobRecord, error: unknown, startedAt: Date): Promise<void> {
    const retryable = error instanceof RetryableJobError;
    const exhausted = record.attempts >= record.maxAttempts;

    if (retryable && !exhausted) {
      const delayMs = error.retryAfterMs ?? computeBackoffMs(record.attempts, { random: this.random });
      const runAt = new Date(this.clock().getTime() + delayMs);
      await this.queueService.retry(record.id, runAt, this.clock());
      this.logger.info('job.retry', {
        jobId: record.id,
        type: record.type,
        attempt: record.attempts,
        maxAttempts: record.maxAttempts,
        delayMs,
        runAt: runAt.toISOString(),
      });
      this.schedulePoll(0);
      return;
    }

    const errorSummary = summarize(error);
    await this.queueService.markDead(record.id, errorSummary, this.clock());
    this.logTerminal(record, 'dead', startedAt, errorSummary);
  }

  private logTerminal(record: JobRecord, status: 'completed' | 'dead', startedAt: Date, summary: string): void {
    this.logger.info('job.terminal', {
      jobId: record.id,
      type: record.type,
      status,
      attempts: record.attempts,
      durationMs: this.clock().getTime() - startedAt.getTime(),
      summary,
    });
  }
}
