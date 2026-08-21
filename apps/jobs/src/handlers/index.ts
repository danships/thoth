import { JobRegistry } from './registry.js';
import { testNoopJobDefinition } from './noop-handler.js';
import {
  webhookDispatchJobDefinition,
  webhookDeliverJobDefinition,
  webhookRedeliverJobDefinition,
} from './webhooks/index.js';
import { historyScanJobDefinition, historyMaintainJobDefinition } from './history/index.js';
import { notificationDispatchJobDefinition, notificationDeliverJobDefinition } from './notifications/index.js';
import {
  maintenancePurgeWorkspacesJobDefinition,
  maintenancePurgePagesJobDefinition,
  maintenancePurgeFilesJobDefinition,
  maintenancePruneJobsJobDefinition,
} from './maintenance/index.js';
import {
  searchSyncPageJobDefinition,
  searchReconcileWorkspaceJobDefinition,
  searchScanWorkspacesJobDefinition,
} from './search/index.js';

/**
 * Builds the internal job registry for this process. The `test.noop` handler is only wired
 * when `NODE_ENV === 'test'`, matching the externally-reachable schema's gating
 * (`@thoth/job-protocol`'s `external-job.ts`) so there is exactly one path — enabled only in
 * test runs — from the socket to a runnable internal job. `webhook.dispatch`/`webhook.deliver`/
 * `webhook.redeliver` are production job types (THOTH-061) registered unconditionally.
 * `history.scan`/`history.maintain` (THOTH-062) are likewise production job types — scheduled
 * internally (`history.scan` hourly, see `../index.ts`), never reachable externally except when
 * `NODE_ENV === 'test'` gates the matching test-only schema in `@thoth/job-protocol`.
 * `maintenance.purge-workspaces`/`maintenance.purge-pages`/`maintenance.purge-files`/
 * `maintenance.prune-jobs` (THOTH-063) are production job types too, and — unlike
 * `history.scan`/`history.maintain` — are **never** reachable externally in any environment;
 * `@thoth/job-protocol`'s `external-job.ts` doesn't reference them at all. `notification.dispatch`
 * (THOTH-066) is a production job type registered unconditionally, mirroring `webhook.dispatch`.
 */
export function createJobRegistry(nodeEnvironment: string): JobRegistry {
  const registry = new JobRegistry();

  registry.register(webhookDispatchJobDefinition);
  registry.register(webhookDeliverJobDefinition);
  registry.register(webhookRedeliverJobDefinition);
  registry.register(notificationDispatchJobDefinition);
  registry.register(notificationDeliverJobDefinition);
  registry.register(historyScanJobDefinition);
  registry.register(historyMaintainJobDefinition);
  registry.register(maintenancePurgeWorkspacesJobDefinition);
  registry.register(searchSyncPageJobDefinition);
  registry.register(searchReconcileWorkspaceJobDefinition);
  registry.register(searchScanWorkspacesJobDefinition);
  registry.register(maintenancePurgePagesJobDefinition);
  registry.register(maintenancePurgeFilesJobDefinition);
  registry.register(maintenancePruneJobsJobDefinition);

  if (nodeEnvironment === 'test') {
    registry.register(testNoopJobDefinition);
  }

  return registry;
}
