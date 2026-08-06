import type { EntityDefinition } from 'supersave';

export const NAME = 'file-usage';

export const FileUsage: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    fileId: 'string',
    containerId: 'string',
    workspaceId: 'string',
    userId: 'string',
    createdAt: 'string',
  },
};
