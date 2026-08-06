import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getLandingWorkspaceForUser } from '@/lib/database/resolve-workspace';

export const metadata: Metadata = { title: 'Workspaces' };

// Legacy bare `/workspaces` URL from before multi-workspace-scoped chrome. Redirects into the
// user's last-used/default workspace at `/[workspaceSlug]/workspaces`, so the page renders with
// the same `AppShell` header + page-tree sidebar as the rest of the app instead of standalone.
async function LegacyWorkspacesIndexPage({ session }: { session: { user: { id: string } } }) {
  const workspace = await getLandingWorkspaceForUser(session.user.id);

  if (!workspace) {
    return redirect('/workspaces/new');
  }

  return redirect(`/${workspace.slug}/workspaces`);
}

export default withAuthPage(LegacyWorkspacesIndexPage);
