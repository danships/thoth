import type { EntityDefinition } from 'supersave';

export const NAME = 'workspace-member';

// Single source of truth for workspace authorization. Only `role: 'owner'` is ever created
// today; `editor`/`viewer` are reserved for future collaboration support.
export const WorkspaceMember: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    workspaceId: 'string',
    userId: 'string',
    role: 'string',
    createdAt: 'string',
  },
};
