import { LoggedInContainer } from '@/components/molecules/sidebar/logged-in-container';

// Renders the workspace sidebar for every workspace-scoped route. There is deliberately no
// `@sidebar/page.tsx`: `/[workspaceSlug]` itself has no `children` page, and Next.js 16.4+
// rejects a parallel-slot page with no matching sibling page ("Unmatched app pages").
export default function SidebarRoot() {
  return <LoggedInContainer />;
}
