import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveWorkspaceForSlug } from '@/lib/database/resolve-workspace';
import { PagesEmptyState } from '@/components/organisms/pages-empty-state';

type Properties = {
  params: Promise<{ workspaceSlug: string }>;
};

async function PagesLandingPage({ params, session }: Properties & { session: { user: { id: string } } }) {
  const { workspaceSlug } = await params;
  // Already validated/authorized by the parent `[workspaceSlug]/layout.tsx`; re-resolving here
  // (rather than trusting the URL segment as-is) keeps this page correct if hit directly, and
  // avoids threading workspace data down from the layout to a server page via context (which
  // only client components can consume).
  const workspace = await resolveWorkspaceForSlug(workspaceSlug, session.user.id);

  const containerRepository = await getContainerRepository();

  // Note: SuperSave does not return results when filtering with `.eq('parentId', null)`,
  // so root pages are found by fetching all pages and filtering client-side (see the same
  // pattern in `src/app/api/v1/pages/tree/route.ts`).
  const pages = await containerRepository.getByQuery(
    addWorkspaceIdToQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('type', 'page'), session.user.id),
      workspace.id
    ).sort('lastUpdated', 'desc')
  );
  const rootPages = pages.filter((page) => page.type === 'page' && !page.parentId);

  if (rootPages.length === 0) {
    return <PagesEmptyState />;
  }

  redirect(`/${workspace.slug}/pages/${rootPages[0]!.id}`);
}

export default withAuthPage<Properties>(PagesLandingPage);
