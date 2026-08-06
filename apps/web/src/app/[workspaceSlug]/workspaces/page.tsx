'use client';

import { WorkspacesIndexClient } from './workspaces-index-client';

// Workspace-scoped (`/[workspaceSlug]/workspaces`) rather than a standalone top-level route, so
// it renders inside the same `AppShell` chrome as the pages routes — header plus the current
// workspace's page-tree sidebar (`src/app/[workspaceSlug]/layout.tsx`) — instead of a bare,
// sidebar-less page. The legacy top-level `/workspaces` URL (`src/app/workspaces/page.tsx`)
// redirects here.
export default function WorkspacesIndexPage() {
  return <WorkspacesIndexClient />;
}
