import type { Metadata } from 'next';
import { withAuthPage } from '@/lib/auth/with-auth-page';
import { WorkspacesIndexClient } from './workspaces-index-client';

export const metadata: Metadata = { title: 'Workspaces' };

function WorkspacesIndexPage() {
  return <WorkspacesIndexClient />;
}

export default withAuthPage(WorkspacesIndexPage);
