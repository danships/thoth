import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getDefaultWorkspaceForUser } from '@/lib/database/resolve-workspace';

// Legacy bare `/pages` URL from before multi-workspace support. Redirects into the user's
// current/default workspace at `/[workspaceSlug]/pages`, which itself resolves the actual
// landing page (first root page, or the empty state).
async function LegacyPagesLandingPage({ session }: { session: { user: { id: string } } }) {
  const workspace = await getDefaultWorkspaceForUser(session.user.id);

  if (!workspace) {
    return redirect('/');
  }

  return redirect(`/${workspace.slug}/pages`);
}

export default withAuthPage(LegacyPagesLandingPage);
