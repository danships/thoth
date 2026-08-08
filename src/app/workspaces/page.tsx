import type { Metadata } from 'next';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { WorkspacesIndexClient } from './workspaces-index-client';

export const metadata: Metadata = { title: 'Workspaces' };

// The root-level `/workspaces` index — renders directly instead of redirecting into a
// workspace-scoped URL (THOTH-069). `withAuthPage` still gates the route on a valid session;
// the list itself is further scoped to the caller's own memberships client-side
// (`useWorkspaces()`).
function WorkspacesIndexPage() {
  return <WorkspacesIndexClient />;
}

export default withAuthPage(WorkspacesIndexPage);
