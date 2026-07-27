import { withAuthPage } from '@/lib/auth/with-auth-page';
import { WorkspaceNewClient } from './new-client';

function WorkspacesNewPage() {
  return <WorkspaceNewClient />;
}

export default withAuthPage(WorkspacesNewPage);
