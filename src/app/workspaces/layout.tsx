import type { PropsWithChildren } from 'react';
import GlobalLayout from '@/components/global-layout';

// Wraps `/workspaces` and its `/workspaces/new` child route in the header-only `GlobalLayout`,
// so they render with the same chrome as the rest of the app without depending on a
// `[workspaceSlug]` segment (THOTH-069).
export default function WorkspacesLayout({ children }: PropsWithChildren) {
  return <GlobalLayout>{children}</GlobalLayout>;
}
