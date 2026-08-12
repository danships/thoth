import { getEnvironment } from './environment';
import { getLogger } from './logger';
import { resolveJobSocketPath } from './socket/socket-path';
import { QueueService } from './queue/queue-service';
import { createJobRegistry } from './handlers/index';
import { Runner } from './runner/runner';
import { Scheduler, type ScheduleDefinition } from './scheduler/scheduler';
import { JobSocketServer } from './socket/server';

/**
 * Process entry point for `@thoth/jobs` (THOTH-059). Wires the in-memory queue, runner,
 * scheduler, and Unix-socket server together, then handles SIGTERM/SIGINT for orderly shutdown:
 * reject new IPC, stop schedules/claims, close the socket, wait (bounded) for active work, exit.
 * Deliberately imports no Next.js/web/database module and opens no TCP/HTTP port.
 */
async function main(): Promise<void> {
  const environment = getEnvironment();
  const logger = getLogger();
  const socketPath = resolveJobSocketPath();

  const queueService = new QueueService();
  const registry = createJobRegistry(environment.NODE_ENV);
  const runner = new Runner(queueService, registry, {
    concurrency: environment.JOB_CONCURRENCY,
    pollIntervalMs: environment.JOB_POLL_INTERVAL_MS,
    logger,
  });

  // No production interval schedules are wired yet (webhooks/purge/history land in later
  // tickets); the scheduler runs with an empty list so its bucket/catch-up machinery is proven
  // out without any real production side effects.
  const schedules: ScheduleDefinition[] = [];
  const scheduler = new Scheduler(queueService, schedules, {
    logger,
    tickIntervalMs: environment.JOB_SCHEDULER_TICK_MS,
  });

  const server = new JobSocketServer({
    socketPath,
    queueService,
    registry,
    logger,
    wake: () => runner.wake(),
  });

  const retentionInterval = setInterval(() => {
    void queueService
      .sweepRetention(environment.JOB_RETENTION_MS, environment.JOB_RETENTION_MAX)
      .then((evicted) => {
        if (evicted.length > 0) {
          logger.info('job.retention.evicted', { count: evicted.length });
        }
      });
  }, Math.min(environment.JOB_RETENTION_MS, 60_000));

  runner.start();
  scheduler.start();
  await server.start();

  logger.info('job.service.ready', { socketPath, concurrency: environment.JOB_CONCURRENCY });

  // Notifies PM2 (`wait_ready: true`, see root `pm2.config.js`) that the process has finished
  // its startup sequence — DB/lease recovery, scheduler init, and the secure socket bind/chmod
  // above are all complete — only now is it safe for PM2 to consider this instance "up" and
  // route/allow dependents to rely on it. `process.send` only exists when an IPC channel is
  // present (i.e. under PM2/a Node parent); plain `node dist/index.js` or `tsx` runs (dev,
  // `apps/jobs` tests) have no such channel and must not throw here.
  process.send?.('ready');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('job.service.shutdown', { signal });

    clearInterval(retentionInterval);
    scheduler.stop();
    await server.stop();
    await runner.stop(environment.JOB_SHUTDOWN_TIMEOUT_MS);

    logger.info('job.service.stopped', { signal });
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error starting @thoth/jobs', error);
    process.exit(1);
  });
}

export { main };
