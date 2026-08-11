import type { EntityDefinition } from 'supersave';

export const NAME = 'app-scoped-container';

// Join table populated when `App.scopeType` is `'containers'` or `'containers_with_children'`
// (in the latter case, holds only the explicitly-selected roots — descendants are resolved
// dynamically via `resolveContainerDescendants`, never stored here).
export const AppScopedContainer: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    appId: 'string',
    containerId: 'string',
    createdAt: 'string',
  },
};
