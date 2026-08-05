import type { Metadata } from 'next';
import type { User } from 'better-auth';
import { notFound } from 'next/navigation';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { isSelfServiceWorkspaceCreationEnabled } from '@/lib/settings/workspace-policy';
import { isPlatformAdmin } from '@/lib/auth/platform-user';
import { WorkspaceNewClient } from './new-client';

export const metadata: Metadata = { title: 'New workspace' };

async function WorkspacesNewPage({ session }: { session: { user: User } }) {
  // THOTH-045: block direct navigation when self-service creation is disabled, unless the caller
  // is a platform administrator (who may always create their own additional workspaces).
  const allowed = (await isSelfServiceWorkspaceCreationEnabled()) || (await isPlatformAdmin(session.user.id));
  if (!allowed) {
    notFound();
  }

  return <WorkspaceNewClient />;
}

export default withAuthPage(WorkspacesNewPage);
