import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getDefaultWorkspaceForUser } from '@/lib/database/resolve-workspace';

// Legacy bare `/pages/create` URL from before multi-workspace support.
async function LegacyCreatePagePage({ session }: { session: { user: { id: string } } }) {
  const workspace = await getDefaultWorkspaceForUser(session.user.id);

  if (!workspace) {
    return redirect('/');
  }

  return redirect(`/${workspace.slug}/pages/create`);
}

export default withAuthPage(LegacyCreatePagePage);
