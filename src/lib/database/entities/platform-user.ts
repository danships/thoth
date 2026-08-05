import type { EntityDefinition } from 'supersave';

export const NAME = 'platform-user';

// Minimal projection of a Better Auth user for platform-role checks and admin listings
// (THOTH-045). Deliberately separate from the workspace authorization model — a `platform_admin`
// gains operational rights only, never implicit access to workspace content.
export const PlatformUser: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    userId: 'string',
    name: 'string',
    email: 'string',
    role: 'string',
    registeredAt: 'string',
    createdAt: 'string',
    lastUpdated: 'string',
  },
};
