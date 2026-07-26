'use client';

import { createContext, useContext, type PropsWithChildren } from 'react';

export type CurrentWorkspace = {
  id: string;
  slug: string;
  name: string;
};

const WorkspaceContext = createContext<CurrentWorkspace | undefined>(undefined);

type WorkspaceProviderProperties = PropsWithChildren & {
  workspace: CurrentWorkspace;
};

// Populated once, server-side, by `src/app/[workspaceSlug]/layout.tsx` (which has already
// resolved and authorized the workspace for the current request) and handed down as a plain
// serializable prop — this just makes that value available to client components anywhere
// beneath it (sidebar, page creation forms, the workspace switcher, etc.) without prop-drilling
// or a redundant client-side fetch.
export function WorkspaceProvider({ workspace, children }: WorkspaceProviderProperties) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

/**
 * Returns the current workspace ({ id, slug, name }) for the workspace-scoped route tree.
 * Throws if used outside a `WorkspaceProvider` (i.e. outside `/[workspaceSlug]/...`) — callers
 * should only be rendered within that route segment.
 */
export function useCurrentWorkspace(): CurrentWorkspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error('useCurrentWorkspace() must be used within a WorkspaceProvider');
  }
  return workspace;
}
