import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PropsWithChildren, ReactNode } from 'react';
import { getAuth } from '@/lib/auth/config';
import { getWorkspaceMemberRepository } from '@/lib/database';
import { resolveWorkspaceForSlug } from '@/lib/database/resolve-workspace';
import { WorkspaceProvider } from '@/lib/store/workspace-context';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';
import Layout from '@/components/layout';

type Properties = PropsWithChildren & {
  sidebar: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
};

// Resolves and authorizes the workspace addressed by the `[workspaceSlug]` URL segment, then
// provides it (via `WorkspaceProvider`) to the whole workspace-scoped route tree — the pages
// list/detail routes, the sidebar (`@sidebar` parallel slot, rendered here as `sidebar`), and
// the workspace switcher in the navbar. `resolveWorkspaceForSlug` itself redirects (throwing)
// if the slug is stale (renamed) or unresolvable, so by the time this renders the workspace is
// guaranteed to exist and the user is a confirmed member.
export default async function WorkspaceLayout({ children, sidebar, params }: Properties) {
  const auth = await getAuth();
  const session = await auth!.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const { workspaceSlug } = await params;
  const workspace = await resolveWorkspaceForSlug(workspaceSlug, session.user.id);

  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const membership = await workspaceMemberRepository.getOneByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', workspace.id).eq('userId', session.user.id)
  );

  return (
    <WorkspaceProvider
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        storageQuotaBytes: workspace.storageQuotaBytes ?? DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
        role: membership?.role ?? 'viewer',
      }}
    >
      <Layout sidebar={sidebar}>{children}</Layout>
    </WorkspaceProvider>
  );
}
