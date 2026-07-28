import type { EntityDefinition } from 'supersave';

export const NAME = 'app';

// A workspace-bound integration configuration ("App"). Owns one or more `ApiKey` rows and,
// when `attributionMode === 'app'`, backs a synthetic `"app--" + id` owner id used to attribute
// content written through its keys (see `src/lib/database/app-service.ts`). Purely additive —
// no `better-auth` table is touched.
export const App: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    workspaceId: 'string',
    createdByUserId: 'string',
    permission: 'string',
    scopeType: 'string',
    archivedAt: 'string',
    createdAt: 'string',
  },
};
