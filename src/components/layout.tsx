'use client';

import { Anchor, AppShell, Burger, Group, Loader, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { type PropsWithChildren, type ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth/provider';
import Image from 'next/image';

type LayoutProperties = PropsWithChildren & {
  sidebar: ReactNode;
};

export default function Layout({ children, sidebar }: LayoutProperties) {
  const [opened, { toggle }] = useDisclosure();
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  const handleLogout = async () => {
    // Await signOut before navigating so the homepage's server-side session check doesn't
    // read a stale authenticated cookie. A full navigation (rather than `router.push`) is used
    // because Next.js can reuse the client Router Cache's already-rendered (authenticated)
    // layout instance across a soft navigation, leaving stale chrome on screen; see the matching
    // comment in login-client.tsx for the same issue on the sign-in path.
    // Only navigate on success; on failure the error notification (shown by signOut) stays
    // visible and the user remains on the current page instead of landing on /login with a
    // stale, still-authenticated session.
    const success = await signOut();
    if (success) {
      globalThis.location.assign('/login');
    }
  };

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
            <Image src="/icons/favicon-32x32.png" width={21} height={21} alt="Thoth Logo" loading="eager" />
            <Title order={5}>Thoth</Title>
          </Group>
          <Anchor
            component="button"
            type="button"
            onClick={handleLogout}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              fontWeight: 500,
              fontSize: '0.95rem',
            }}
          >
            Logout
          </Anchor>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section>{sidebar}</AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
