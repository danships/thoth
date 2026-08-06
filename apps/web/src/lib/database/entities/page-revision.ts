import type { EntityDefinition } from 'supersave';

export const NAME = 'page-revision';

export const PageRevision: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    containerId: 'string',
    userId: 'string',
    workspaceId: 'string',
    target: 'string',
    sequence: 'number',
    kind: 'string',
    author: 'string',
    createdAt: 'string',
    lastUpdated: 'string',
  },
};
