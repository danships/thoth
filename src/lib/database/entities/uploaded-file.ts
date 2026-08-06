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
    // The user whose storage quota this upload counts against (THOTH-045). For cookie uploads
    // this equals `userId`; for API-key uploads with `attributionMode: 'app'` it is the owning
    // App's `createdByUserId` (a real user), diverging from the synthetic `app--<id>` `userId`.
    billingUserId: 'string',
  },
};
