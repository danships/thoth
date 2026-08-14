import type { PropsWithChildren } from 'react';
import GlobalLayout from '@/components/global-layout';

// Wraps the global `/notifications` inbox in the header-only `GlobalLayout` (like `/workspaces`),
// so it renders with the shared chrome without depending on a `[workspaceSlug]` segment
// (THOTH-066). The sibling `[id]/open` route handler is unaffected by this layout.
export default function NotificationsLayout({ children }: PropsWithChildren) {
  return <GlobalLayout>{children}</GlobalLayout>;
}
