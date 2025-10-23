import type { EntityDefinition } from 'supersave';

export const NAME = 'container';

export const Container: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    name: 'string',
    lastUpdated: 'string',
    createdAt: 'string',
    parentId: 'string',
    workspaceId: 'string',
    userId: 'string',
    type: 'string',
  },
};
