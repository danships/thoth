import type { EntityDefinition } from 'supersave';

export const NAME = 'workspace-member';

// Single source of truth for workspace authorization. `role` is display/semantics only —
// capability (read/read_write, workspace/containers/containers_with_children scope) is derived
// from `permission`/`scopeType`, the same shape as `App` (THOTH-042), so member and App grants
// are enforced identically via `AccessGrant` (see `src/lib/auth/access-grant.ts`).
export const WorkspaceMember: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    workspaceId: 'string',
    userId: 'string',
    role: 'string',
    permission: 'string',
    scopeType: 'string',
    createdAt: 'string',
  },
};
