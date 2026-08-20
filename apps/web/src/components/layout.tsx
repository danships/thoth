'use client';

import { AppShell, Loader } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type PropsWithChildren, type ReactNode, Suspense, useEffect } from 'react';
import { useAuth } from '@/lib/auth/provider';
import { WorkspaceMenu } from '@/components/molecules/sidebar/workspace-menu';
import { AppHeader } from '@/components/molecules/app-header';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';

type LayoutProperties = PropsWithChildren & {
  sidebar: ReactNode;
};

// useSearchParams() opts the nearest Suspense boundary into client-side rendering, and Next.js
// requires it to be wrapped in a Suspense boundary (there is none above `Layout` in the tree).
// Isolating it in this tiny subcomponent keeps that de-opt scoped to a no-op (it renders
// nothing) instead of affecting the whole `Layout` tree.
function CloseNavbarOnNavigate({ close }: { close: () => void }) {
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const searchParametersKey = searchParameters.toString();

  // Close the mobile navbar overlay whenever the route (pathname or `?v=` query) changes, so
  // client-side navigation from a sidebar link doesn't leave the overlay covering the newly
  // routed content. `close()` is idempotent, so this is a no-op on mount and on desktop.
  useEffect(() => {
    close();
  }, [pathname, searchParametersKey, close]);

  return null;
}

export default function Layout({ children, sidebar }: LayoutProperties) {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, loading } = useAuth();
  const workspace = useCurrentWorkspace();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return <Loader />;
  }

  if (!user) {
    return undefined; // Will redirect to login
  }

  return (
    <AppShell
      // Use a small non-zero base padding instead of collapsing it to 0. Mantine's AppShell
      // only writes the `--app-shell-padding` CSS variable when a responsive size's `base`
      // value is truthy (see assignPaddingVariables upstream); AppShell.Main's
      // `padding-top: calc(var(--app-shell-header-offset) + var(--app-shell-padding))` becomes
      // an invalid calc() if that variable is ever missing/falsy, and the browser drops the
      // whole declaration - collapsing padding-top to 0 and letting Main's content (e.g. the
      // page detail header and its "Add View" button) render underneath the fixed header. A
      // small always-truthy value avoids relying on any particular falsy/truthy edge case.
      padding={{ base: 'xs', sm: 'md' }}
      header={{ height: 30 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
    >
      <Suspense fallback={null}>
        <CloseNavbarOnNavigate close={close} />
      </Suspense>
      <AppShell.Header>
        <AppHeader
          navbarOpened={opened}
          onToggleNavbar={toggle}
          showBurger
          searchWorkspace={{ id: workspace.id, slug: workspace.slug }}
        />
      </AppShell.Header>

      <AppShell.Navbar p="md" style={{ display: 'flex', flexDirection: 'column' }}>
        <AppShell.Section grow style={{ overflow: 'auto' }}>
          {sidebar}
        </AppShell.Section>
        <AppShell.Section mt="sm">
          <WorkspaceMenu />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
