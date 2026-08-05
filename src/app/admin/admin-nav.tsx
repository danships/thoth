'use client';

import { AppShell, Burger, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronLeft, IconServer2, IconSettings, IconUsers } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: IconSettings },
  { href: '/admin/users', label: 'Users', icon: IconUsers },
  { href: '/admin/workspaces', label: 'Workspaces', icon: IconServer2 },
];

/**
 * Standalone navigation shell for the platform-admin area (THOTH-045). Deliberately does NOT use
 * the workspace `AppShell` — the admin area is workspace-agnostic and must not link into any
 * workspace content.
 */
export function AdminNav({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Title order={4}>Platform administration</Title>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              leftSection={<Icon size={18} />}
              active={active}
            />
          );
        })}
        <NavLink
          component={Link}
          href="/workspaces"
          label="Back to workspaces"
          leftSection={<IconChevronLeft size={18} />}
          mt="md"
        />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
