import type { EntityDefinition } from 'supersave';

export const NAME = 'workspace-slug-redirect';

// Powers "a renamed workspace's old slug keeps working until another workspace claims it".
// `slug` here is always a *previous* slug of `workspaceId`, never a currently-live one.
export const WorkspaceSlugRedirect: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    slug: 'string',
    workspaceId: 'string',
    createdAt: 'string',
  },
};
