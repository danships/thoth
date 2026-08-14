import type { EntityDefinition } from 'supersave';

export const NAME = 'notification-delivery';

// One row = one Web Push attempt stream for one `(notification, push-subscription)` pair
// (THOTH-071). Idempotent fan-out: `(notificationId, pushSubscriptionId)` is the logical
// identity, reconciled in application code via a small in-process lock and canonical-row
// selection (SuperSave has no DB-native unique indexes).
export const NotificationDelivery: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    notificationId: 'string',
    pushSubscriptionId: 'string',
    status: 'string',
    createdAt: 'string',
    lastAttemptAt: 'string',
    id: 'string',
  },
};
