import type { EntityDefinition } from 'supersave';

export const NAME = 'notification-rule';

// One explicit subscription/exclusion rule owned by a human user in one workspace (THOTH-066).
// Logical identity / duplicate reconciliation is `(userId, workspaceId, containerId)` — see
// `packages/database/src/notification-service.ts` for canonicalisation and precedence.
export const NotificationRule: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    userId: 'string',
    workspaceId: 'string',
    containerId: 'string',
    kind: 'string',
    lastUpdated: 'string',
    createdAt: 'string',
  },
};
