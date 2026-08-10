import type { EntityDefinition } from 'supersave';

export const NAME = 'api-key';

// The credential itself. Deliberately thin — all permission/scope config lives on the parent
// `App`, so minting or rotating a key never touches authorization config.
export const ApiKey: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    appId: 'string',
    keyPrefix: 'string',
    keyHash: 'string',
    expiresAt: 'string',
    revokedAt: 'string',
    createdAt: 'string',
  },
};
