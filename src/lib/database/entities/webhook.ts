import type { EntityDefinition } from 'supersave';

export const NAME = 'webhook';

// A delivery endpoint configured on an App (1:N — an App may own several). `workspaceId` is
// denormalised from the parent App so the notify-resolver can filter by workspace in one query
// without joining. See `src/lib/webhooks/notify-service.ts` for how webhooks are resolved/fired
// and `src/lib/database/webhook-service.ts` for secret generation/rotation.
export const Webhook: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    appId: 'string',
    workspaceId: 'string',
    enabled: 'boolean',
    createdAt: 'string',
  },
};
