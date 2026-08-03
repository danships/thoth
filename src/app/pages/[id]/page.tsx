import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getWorkspaceSlugForContainer } from '@/lib/database/resolve-workspace';

export const metadata: Metadata = { title: 'Page' };

type LegacyPageDetailsProperties = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Legacy bare `/pages/[id]` URL from before multi-workspace support. The page may belong to any
// of the user's workspaces (not necessarily their default one), so the destination workspace
// slug is derived from the page itself, and the `?v=` (selected view) query param is preserved.
async function LegacyPageDetailsPage({
  params,
  searchParams,
  session,
}: LegacyPageDetailsProperties & { session: { user: { id: string } } }) {
  const { id } = await params;
  const query = await searchParams;

  const slug = await getWorkspaceSlugForContainer(id, session.user.id);
  if (!slug) {
    return redirect('/');
  }

  const view = query['v'];
  const viewSuffix = typeof view === 'string' ? `?v=${encodeURIComponent(view)}` : '';

  return redirect(`/${slug}/pages/${id}${viewSuffix}`);
}

export default withAuthPage<LegacyPageDetailsProperties>(LegacyPageDetailsPage);
