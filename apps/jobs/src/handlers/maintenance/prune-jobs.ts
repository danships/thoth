import {
  maintenancePruneJobsPayloadV1Schema,
  maintenancePruneJobsDedupeKey,
  type JobDefinition,
  type JobExecutionContext,
  type MaintenancePruneJobsPayloadV1,
} from '@thoth/job-protocol';
import { getEnvironment } from '../../environment.js';
import { getLogger } from '../../logger.js';
import { getQueueService } from '../../queue/queue-context.js';

const MAINTENANCE_PRUNE_JOBS_PRIORITY = 1;
const MAINTENANCE_PRUNE_JOBS_MAX_ATTEMPTS = 3;
const PRUNE_BATCH_SIZE = 200;

export type MaintenancePruneJobsResult = {
  pruned: number;
  hasMoreWork: boolean;
};

/**
 * `maintenance.prune-jobs` — deletes terminal (`completed`/`dead`) in-memory job records older
 * than their respective retention horizons (`JOB_COMPLETED_RETENTION_DAYS`/
 * `JOB_DEAD_RETENTION_DAYS`, defaults 7/30 days — see `../../environment.ts`), THOTH-063.
 *
 * Distinct from the always-on, short-lived `sweepRetention` memory-hygiene sweep already run on
 * a timer in `../../index.ts` (`JOB_RETENTION_MS`/`JOB_RETENTION_MAX`, default 15 minutes / 500
 * records) — this scheduled job applies the longer, operator-facing retention policy the
 * THOTH-063 spec calls for. Never touches `queued`/`running` records (enforced by
 * `QueueStore#pruneTerminalByPolicy`). A job's terminal transition is already logged exactly
 * once, at the moment it happens (`runner.ts`'s `job.terminal`/`job.dead` logs) — pruning a row
 * later never re-emits or duplicates that alert.
 */
export const maintenancePruneJobsJobDefinition: JobDefinition<MaintenancePruneJobsPayloadV1> = {
  type: 'maintenance.prune-jobs',
  payloadVersion: 1,
  payloadSchema: maintenancePruneJobsPayloadV1Schema,
  priority: MAINTENANCE_PRUNE_JOBS_PRIORITY,
  maxAttempts: MAINTENANCE_PRUNE_JOBS_MAX_ATTEMPTS,
  dedupeKey: maintenancePruneJobsDedupeKey,
  handler: async (context: JobExecutionContext<MaintenancePruneJobsPayloadV1>): Promise<MaintenancePruneJobsResult> => {
    const environment = getEnvironment();
    const logger = getLogger();
    const queueService = getQueueService();

    const now = context.now();
    const completedMaxAgeMs = environment.JOB_COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const deadMaxAgeMs = environment.JOB_DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const { ids, totalEligible } = await queueService.pruneTerminalByPolicy(
      { completedMaxAgeMs, deadMaxAgeMs, limit: PRUNE_BATCH_SIZE, offset: 0 },
      now
    );

    if (ids.length > 0) {
      logger.info('maintenance.prune-jobs.pruned', { count: ids.length });
    }

    const hasMoreWork = !context.signal.aborted && ids.length < totalEligible;
    if (hasMoreWork) {
      await context.enqueueChild({
        type: 'maintenance.prune-jobs',
        payloadVersion: 1,
        payload: {},
        dedupeKey: maintenancePruneJobsDedupeKey(),
      });
    }

    return { pruned: ids.length, hasMoreWork };
  },
};
