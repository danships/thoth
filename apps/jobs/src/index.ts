import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext } from '@thoth/database';
import { searchReconcileWorkspaceExternalPayloadV1Schema } from '@thoth/job-protocol';
import { getEnvironment } from './environment.js';
import { createJobRegistry } from './handlers/index.js';
import { getLogger } from './logger.js';
import { setQueueService } from './queue/queue-context.js';
import { resolveHygieneSweepMaxAgeMs } from './queue/queue-store.js';
import { QueueService } from './queue/queue-service.js';
import { Runner } from './runner/runner.js';
import { Scheduler, type ScheduleDefinition } from './scheduler/scheduler.js';
import { setSearchService } from './search/search-context.js';
import { createWorkspaceSearchService } from './search/workspace-search-service.js';
import { JobSocketServer } from './socket/server.js';
import { resolveJobSocketPath } from './socket/socket-path.js';

async function main(): Promise<void> {
  const environment = getEnvironment();
  const logger = getLogger();
  const socketPath = resolveJobSocketPath();

  const databaseContext = createDatabaseContext({ connectionString: environment.DB, skipSync: true });
  setDatabaseContext(databaseContext);

  const queueService = new QueueService();
  setQueueService(queueService);
  const registry = createJobRegistry(environment.NODE_ENV);

  const searchService = createWorkspaceSearchService({
    storageLocalFolder: environment.STORAGE_LOCAL_FOLDER,
    modelId: environment.SEARCH_MODEL_ID,
    modelCacheDir: nodePath.isAbsolute(environment.SEARCH_MODEL_CACHE_DIR)
      ? environment.SEARCH_MODEL_CACHE_DIR
      : nodePath.resolve(process.cwd(), environment.SEARCH_MODEL_CACHE_DIR),
    indexVersion: environment.SEARCH_INDEX_VERSION,
    logger,
    enqueueReconcile: async (workspaceId) => {
      const definition = registry.get('search.reconcile-workspace');
      if (!definition) {
        return;
      }
      const payload = searchReconcileWorkspaceExternalPayloadV1Schema.parse({ workspaceId });
      const dedupeKey = definition.dedupeKey?.(payload);
      await queueService.enqueue({
        type: definition.type,
        payloadVersion: definition.payloadVersion,
        payload,
        priority: definition.priority,
        maxAttempts: definition.maxAttempts,
        ...(dedupeKey === undefined ? {} : { dedupeKey }),
        ...(definition.coalesce ? { coalesce: definition.coalesce } : {}),
      });
    },
  });
  setSearchService(searchService);

  const runner = new Runner(queueService, registry, {
    concurrency: environment.JOB_CONCURRENCY,
    pollIntervalMs: environment.JOB_POLL_INTERVAL_MS,
    logger,
  });

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const schedules: ScheduleDefinition[] =
    environment.NODE_ENV === 'test'
      ? []
      : [
          {
            type: 'history.scan',
            intervalMs: HOUR_MS,
            priority: 6,
            maxAttempts: 3,
            payloadVersion: 1,
            payload: {},
          },
          {
            type: 'search.scan-workspaces',
            intervalMs: environment.SEARCH_RECONCILE_INTERVAL_MS,
            priority: 3,
            maxAttempts: 3,
            payloadVersion: 1,
            payload: {},
          },
          {
            type: 'maintenance.purge-files',
            intervalMs: HOUR_MS,
            priority: 2,
            maxAttempts: 3,
            payloadVersion: 1,
            payload: { offset: 0 },
          },
          {
            type: 'maintenance.purge-pages',
            intervalMs: DAY_MS,
            priority: 2,
            maxAttempts: 3,
            payloadVersion: 1,
            payload: { offset: 0 },
          },
          {
            type: 'maintenance.purge-workspaces',
            intervalMs: DAY_MS,
            priority: 2,
            maxAttempts: 3,
            payloadVersion: 1,
            payload: { offset: 0 },
          },
          {
            type: 'maintenance.prune-jobs',
            intervalMs: DAY_MS,
            priority: 1,
            maxAttempts: 3,
            payloadVersion: 1,
            payload: {},
          },
        ];
  const scheduler = new Scheduler(queueService, schedules, {
    logger,
    tickIntervalMs: environment.JOB_SCHEDULER_TICK_MS,
  });

  const server = new JobSocketServer({
    socketPath,
    queueService,
    registry,
    logger,
    searchService,
    searchQueryTimeoutMs: environment.SEARCH_QUERY_TIMEOUT_MS,
    wake: () => runner.wake(),
  });

  const hygieneSweepMaxAgeMs = resolveHygieneSweepMaxAgeMs({
    hygieneMaxAgeMs: environment.JOB_RETENTION_MS,
    completedMaxAgeMs: environment.JOB_COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    deadMaxAgeMs: environment.JOB_DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  });

  const retentionInterval = setInterval(() => {
    void queueService.sweepRetention(hygieneSweepMaxAgeMs, environment.JOB_RETENTION_MAX).then((evicted) => {
      if (evicted.length > 0) {
        logger.info('job.retention.evicted', { count: evicted.length });
      }
    });
  }, Math.min(environment.JOB_RETENTION_MS, 60_000));

  runner.start();
  scheduler.start();
  await server.start();

  if (environment.NODE_ENV !== 'test') {
    await searchService.warmup();
  }

  logger.info('job.service.ready', { socketPath, concurrency: environment.JOB_CONCURRENCY });
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
    await searchService.clearCaches();
    await databaseContext.close();

    logger.info('job.service.stopped', { signal });
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

try {
  await main();
} catch (error: unknown) {
  console.error('Fatal error starting @thoth/jobs', error);
  process.exit(1);
}

export { main };
