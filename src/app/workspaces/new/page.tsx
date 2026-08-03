import type { Metadata } from 'next';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { WorkspaceNewClient } from './new-client';

export const metadata: Metadata = { title: 'New workspace' };

function WorkspacesNewPage() {
  return <WorkspaceNewClient />;
}

export default withAuthPage(WorkspacesNewPage);
