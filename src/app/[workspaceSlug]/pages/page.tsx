import { redirect } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { getContainerRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveWorkspaceForSlug } from '@/lib/database/resolve-workspace';
import { PagesEmptyState } from '@/components/organisms/pages-empty-state';
import { filterContainersByGrantForSession } from '@/lib/auth/access-grant';
import type { ApiKeySession } from '@/lib/auth/session';

type Properties = {
  params: Promise<{ workspaceSlug: string }>;
};

async function PagesLandingPage({ params, session }: Properties & { session: ApiKeySession }) {
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
  // Content is scoped by workspace membership + grant, not creator (THOTH-042) —
  // `resolveWorkspaceForSlug` above already asserts the caller is a member of `workspace.id`,
  // and `filterContainersByGrantForSession` further restricts to pages the caller's grant allows,
  // mirroring the pattern used by the pages API/tree routes.
  const pages = await filterContainersByGrantForSession(
    session,
    await containerRepository.getByQuery(
      addWorkspaceIdToQuery(containerRepository.createQuery().eq('type', 'page'), workspace.id).sort(
        'lastUpdated',
        'desc'
      )
    )
  );
  const rootPages = pages.filter((page) => page.type === 'page' && !page.parentId && !page.deletedAt);

  if (rootPages.length === 0) {
    return <PagesEmptyState />;
  }

  redirect(`/${workspace.slug}/pages/${rootPages[0]!.id}`);
}

export default withAuthPage<Properties>(PagesLandingPage);
