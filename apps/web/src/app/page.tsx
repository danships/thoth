import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/config';
import { getLandingWorkspaceForUser } from '@/lib/database/resolve-workspace';

export default async function Home() {
  const auth = await getAuth();
  const session = await auth!.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const workspace = await getLandingWorkspaceForUser(session.user.id);
  if (!workspace) {
    // No active workspace at all (e.g. the user's only workspace was soft-deleted). Send them
    // to the dedicated creation flow so they always end up with somewhere to work.
    redirect('/workspaces/new');
  }

  redirect(`/${workspace.slug}/pages`);
}
