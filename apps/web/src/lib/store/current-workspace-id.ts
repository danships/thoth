import { atom } from 'nanostores';

// Mirror of the current workspace's id (from `WorkspaceProvider`) for non-React consumers that
// can't call `useCurrentWorkspace()` — e.g. imperative store/action code. Kept in sync by
// `WorkspaceProvider` on the client; `undefined` outside a workspace-scoped route.
export const $currentWorkspaceId = atom<string | undefined>(undefined);
