import { JobRegistry } from './registry.js';
import { testNoopJobDefinition } from './noop-handler.js';
import {
  webhookDispatchJobDefinition,
  webhookDeliverJobDefinition,
  webhookRedeliverJobDefinition,
} from './webhooks/index.js';

/**
 * Builds the internal job registry for this process. The `test.noop` handler is only wired
 * when `NODE_ENV === 'test'`, matching the externally-reachable schema's gating
 * (`@thoth/job-protocol`'s `external-job.ts`) so there is exactly one path — enabled only in
 * test runs — from the socket to a runnable internal job. `webhook.dispatch`/`webhook.deliver`/
 * `webhook.redeliver` are production job types (THOTH-061) registered unconditionally.
 */
export function createJobRegistry(nodeEnvironment: string): JobRegistry {
  const registry = new JobRegistry();

  registry.register(webhookDispatchJobDefinition);
  registry.register(webhookDeliverJobDefinition);
  registry.register(webhookRedeliverJobDefinition);

  if (nodeEnvironment === 'test') {
    registry.register(testNoopJobDefinition);
  }

  return registry;
}
