import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getWorkspaceSlugForContainer } from '@/lib/database/resolve-workspace';

export const metadata: Metadata = { title: 'Create page' };

type LegacyCreateSubpageProperties = {
  params: Promise<{ id: string }>;
};

// Legacy bare `/pages/[id]/create` URL from before multi-workspace support.
async function LegacyCreateSubpagePage({
  params,
  session,
}: LegacyCreateSubpageProperties & { session: { user: { id: string } } }) {
  const { id } = await params;

  const slug = await getWorkspaceSlugForContainer(id, session.user.id);
  if (!slug) {
    return redirect('/');
  }

  return redirect(`/${slug}/pages/${id}/create`);
}

export default withAuthPage<LegacyCreateSubpageProperties>(LegacyCreateSubpagePage);
