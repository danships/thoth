import type { EntityDefinition } from 'supersave';

export const NAME = 'container-access';

export const ContainerAccess: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    containerId: 'string',
    parentId: 'string',
    workspaceId: 'string',
    userId: 'string',
    lastAccessedAt: 'string',
    starred: 'boolean',
    starredAt: 'string',
  },
};
