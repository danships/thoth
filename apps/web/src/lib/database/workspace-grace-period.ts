import { getEnvironment } from '../environment';

export const DEFAULT_WORKSPACE_DELETE_GRACE_PERIOD_DAYS = 30;

/**
 * Resolves the number of days a soft-deleted workspace is retained before the external purge
 * job permanently removes it. Single source of truth for both the restore endpoint (which must
 * not 410 a workspace the purge job still retains) and the purge script — reads
 * `WORKSPACE_DELETE_GRACE_PERIOD_DAYS`, falling back to the documented 30-day default.
 */
export async function getWorkspaceDeleteGracePeriodDays(): Promise<number> {
  const environment = await getEnvironment();
  const parsed = Number.parseInt(environment.WORKSPACE_DELETE_GRACE_PERIOD_DAYS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WORKSPACE_DELETE_GRACE_PERIOD_DAYS;
}
