'use client';

import { NotificationInbox } from '@/components/molecules/notification-inbox';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';

// The workspace-scoped inbox (THOTH-066): the same list as the global `/notifications` page but
// filtered to the current workspace only.
export default function WorkspaceNotificationsPage() {
  const workspace = useCurrentWorkspace();
  useDocumentTitle('Notifications');
  return <NotificationInbox workspaceId={workspace.id} title={`Notifications in ${workspace.name}`} />;
}
