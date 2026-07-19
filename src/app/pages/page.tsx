import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { PagesEmptyState } from '@/components/organisms/pages-empty-state';

async function PagesLandingPage({ session }: { session: { user: { id: string } } }) {
  const workspaceRepository = await getWorkspaceRepository();
  const workspace = await workspaceRepository.getOneByQuery(
    addUserIdToQuery(workspaceRepository.createQuery(), session.user.id)
  );

  if (!workspace) {
    return <PagesEmptyState />;
  }

  const containerRepository = await getContainerRepository();

  // Note: SuperSave does not return results when filtering with `.eq('parentId', null)`,
  // so root pages are found by fetching all pages and filtering client-side (see the same
  // pattern in `src/app/api/v1/pages/tree/route.ts`).
  const pages = await containerRepository.getByQuery(
    addUserIdToQuery(containerRepository.createQuery().eq('type', 'page'), session.user.id).sort('lastUpdated', 'desc')
  );
  const rootPages = pages.filter((page) => page.type === 'page' && !page.parentId);

  if (rootPages.length === 0) {
    return <PagesEmptyState />;
  }

  redirect(`/pages/${rootPages[0]!.id}`);
}

export default withAuthPage(PagesLandingPage);
