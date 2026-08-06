import type { EntityDefinition } from 'supersave';

export const NAME = 'setting';

// Generic key/value configuration store (THOTH-045) used for the platform workspace-creation
// policy and all three quota scopes. `(scope, subjectId, key)` is the logical identity, enforced
// in application code (see `src/lib/settings/service.ts`) since SuperSave has no unique indexes.
export const Setting: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    scope: 'string',
    subjectId: 'string',
    key: 'string',
    createdAt: 'string',
    lastUpdated: 'string',
  },
};
