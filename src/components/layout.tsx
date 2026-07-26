'use client';

import { AppShell, Burger, Group, Loader, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { type PropsWithChildren, type ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth/provider';
import { WorkspaceMenu } from '@/components/molecules/sidebar/workspace-menu';
import Image from 'next/image';

type LayoutProperties = PropsWithChildren & {
  sidebar: ReactNode;
};

export default function Layout({ children, sidebar }: LayoutProperties) {
  const [opened, { toggle }] = useDisclosure();
  const { user, loading } = useAuth();
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
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" style={{ width: '100%' }}>
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Image src="/icons/favicon-32x32.png" width={21} height={21} alt="Thoth Logo" loading="eager" />
            <Title order={5}>Thoth</Title>
          </Group>
        </Group>
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
