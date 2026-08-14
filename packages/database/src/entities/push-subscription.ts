import type { EntityDefinition } from 'supersave';

export const NAME = 'push-subscription';

// One browser/service-worker registration per human (THOTH-071). Logical identity is `endpoint`
// (the Push endpoint URL the provider issued); uniqueness is enforced in application code
// (`packages/database/src/push-subscription-service.ts`) via an in-process lock, since
// SuperSave has no DB-native unique indexes.
export const PushSubscription: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    userId: 'string',
    endpoint: 'string',
    disabledAt: 'string',
    createdAt: 'string',
    lastSeenAt: 'string',
    id: 'string',
  },
};
