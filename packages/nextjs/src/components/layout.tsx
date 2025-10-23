'use client';

import { AppShell, Burger, Group, Loader, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { type PropsWithChildren, type ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth/provider';
import appIcon from '@/app/icons/favicon-32x32.png'
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
      padding="md"
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
            <Image src={appIcon} width="21" height="21" alt="Thoth Logo" />
            <Title order={5}>Thoth</Title>
          </Group>
          <a
            href="/logout"
            style={{
              textDecoration: 'none',
              color: 'inherit',
              fontWeight: 500,
              fontSize: '0.95rem',
            }}
          >
            Logout
          </a>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>{sidebar}</AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
