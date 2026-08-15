import type { EntityDefinition } from 'supersave';

export const NAME = 'notification';

// One immutable, fully-rendered inbox item for one recipient for one `notification.dispatch`
// job (THOTH-066). Logical identity / idempotency is `(sourceJobId, userId)` — see
// `packages/database/src/notification-service.ts#findNotificationBySourceJobAndRecipient`.
export const Notification: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    userId: 'string',
    workspaceId: 'string',
    containerId: 'string',
    sourceJobId: 'string',
    readAt: 'string',
    occurredAt: 'string',
    createdAt: 'string',
    pushDisposition: 'string',
    id: 'string',
  },
};
