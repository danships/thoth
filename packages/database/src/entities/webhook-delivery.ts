import type { EntityDefinition } from 'supersave';

export const NAME = 'webhook-delivery';

// One row = the immutable payload for one destination plus its mutable attempt history
// (THOTH-061). Capped at 25 *terminal* rows per `webhookId` (see
// `packages/database/src/webhook-delivery-service.ts`) — pending/retrying rows and rows
// referenced by an active job are never pruned. A resend resets the same row rather than
// creating a new one.
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
    sourceJobId: 'string',
    nextAttemptAt: 'string',
  },
};
