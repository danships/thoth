import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth/config';
import { getDefaultWorkspaceForUser } from '@/lib/database/resolve-workspace';

export default async function Home() {
  const auth = await getAuth();
  const session = await auth!.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const workspace = await getDefaultWorkspaceForUser(session.user.id);
  if (!workspace) {
    // No workspace membership at all (shouldn't happen — every user gets one on signup), so
    // there's nowhere workspace-scoped to send them.
    redirect('/login');
  }

  redirect(`/${workspace.slug}/pages`);
}
