import { withAuthPage } from '@/lib/auth/with-auth-page';
import { WorkspacesIndexClient } from './workspaces-index-client';

function WorkspacesIndexPage() {
  return <WorkspacesIndexClient />;
}

export default withAuthPage(WorkspacesIndexPage);
