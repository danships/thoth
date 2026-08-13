import { z } from 'zod';

/**
 * Internal-only maintenance job payloads (THOTH-063): bounded, restart-safe purge/pruning jobs
 * that convert the former `scripts/purge-deleted-*.ts` cron scripts into scheduled job handlers.
 *
 * Every payload here carries only a continuation cursor (a plain numeric `offset` into the
 * eligible-row set computed fresh at execution time — see
 * `packages/database/src/services/maintenance`) — never target ids, credentials, or content.
 *
 * These types are **never** reachable over the external Unix-socket IPC boundary, in any
 * environment (unlike `history.scan`/`history.maintain`, which are exposed under
 * `NODE_ENV === 'test'` for integration tests) — `external-job.ts` does not import or reference
 * any of them, matching the THOTH-063 spec's explicit "must not be added to the externally
 * accepted Unix-socket union" requirement. Only the scheduler and the manual CLI wrappers under
 * `apps/jobs/src/cli` ever produce one of these payloads.
 */

const maintenanceOffsetPayloadSchema = z
  .object({
    /** Cursor into the eligible-row set for this run's continuation chain; `0` for a fresh occurrence. */
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();

export const maintenancePurgeWorkspacesPayloadV1Schema = maintenanceOffsetPayloadSchema;
export type MaintenancePurgeWorkspacesPayloadV1 = z.infer<typeof maintenancePurgeWorkspacesPayloadV1Schema>;

export const maintenancePurgePagesPayloadV1Schema = maintenanceOffsetPayloadSchema;
export type MaintenancePurgePagesPayloadV1 = z.infer<typeof maintenancePurgePagesPayloadV1Schema>;

export const maintenancePurgeFilesPayloadV1Schema = maintenanceOffsetPayloadSchema;
export type MaintenancePurgeFilesPayloadV1 = z.infer<typeof maintenancePurgeFilesPayloadV1Schema>;

export const maintenancePruneJobsPayloadV1Schema = z.object({}).strict();
export type MaintenancePruneJobsPayloadV1 = z.infer<typeof maintenancePruneJobsPayloadV1Schema>;

/** Fixed, type-level active-dedupe key — at most one occurrence of a maintenance type is ever queued/running. */
export function maintenancePurgeWorkspacesDedupeKey(): string {
  return 'maintenance:purge-workspaces';
}
export function maintenancePurgePagesDedupeKey(): string {
  return 'maintenance:purge-pages';
}
export function maintenancePurgeFilesDedupeKey(): string {
  return 'maintenance:purge-files';
}
export function maintenancePruneJobsDedupeKey(): string {
  return 'maintenance:prune-jobs';
}
