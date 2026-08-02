import type { EntityDefinition } from 'supersave';

export const NAME = 'member-scoped-container';

// Join table populated when a `WorkspaceMember`'s `scopeType` is `'containers'` or
// `'containers_with_children'` (in the latter case, holds only the explicitly-selected roots —
// descendants are resolved dynamically via `resolveContainerDescendants`, never stored here).
// Mirrors `app-scoped-container.ts` so member and App scoping resolve identically (THOTH-042).
export const MemberScopedContainer: EntityDefinition = {
  name: NAME,
  relations: [],
  template: {},
  filterSortFields: {
    workspaceMemberId: 'string',
    containerId: 'string',
    createdAt: 'string',
  },
};
