'use client';

import { createContext, useContext, useEffect, useRef, type PropsWithChildren } from 'react';
import { $currentWorkspaceId } from './current-workspace-id';
import { clearExpandedPages } from './tree-expanded-state';
import { writeLastWorkspaceSlugCookie } from '@/lib/workspace/last-workspace-cookie';
import type { AppScopeType } from '@thoth/database/types';

export type CurrentWorkspace = {
  id: string;
  slug: string;
  name: string;
  storageQuotaBytes: number;
  role: 'owner' | 'editor' | 'viewer' | 'app';
  scopeType: AppScopeType;
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
  const previousWorkspaceId = useRef<string | undefined>(undefined);

  // Keep the non-React nanostore mirror in sync, remember the active workspace for the root
  // redirect (via cookie), and clear stale expanded-tree state whenever the workspace actually
  // changes (i.e. the user switched workspaces, not just navigated within one).
  useEffect(() => {
    $currentWorkspaceId.set(workspace.id);
    writeLastWorkspaceSlugCookie(workspace.slug);

    if (previousWorkspaceId.current !== undefined && previousWorkspaceId.current !== workspace.id) {
      clearExpandedPages();
    }
    previousWorkspaceId.current = workspace.id;
  }, [workspace.id, workspace.slug]);

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
