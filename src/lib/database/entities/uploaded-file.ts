import type { EntityDefinition } from 'supersave';

export const NAME = 'uploaded-file';

export const UploadedFile: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    userId: 'string',
    workspaceId: 'string',
    storageType: 'string',
    mimeType: 'string',
    createdAt: 'string',
    lastUpdated: 'string',
  },
};
