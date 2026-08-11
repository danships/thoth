import type { EntityDefinition } from 'supersave';

export const NAME = 'webhook-delivery';

// A history row of one delivery attempt for a `webhook`. Capped at 25 rows per `webhookId` (see
// `recordAndPrune` in `src/lib/database/webhook-service.ts`) — a resend updates the row in place
// instead of growing history further.
export const WebhookDelivery: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    webhookId: 'string',
    appId: 'string',
    containerId: 'string',
    status: 'string',
    createdAt: 'string',
  },
};
