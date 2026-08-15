'use client';

import { ActionIcon, Avatar, Group, Loader, Menu, Text } from '@mantine/core';
import {
  IconBellCog,
  IconChevronDown,
  IconKey,
  IconLayoutGrid,
  IconLogout,
  IconPlus,
  IconSettings,
  IconShieldLock,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/provider';
import { useWorkspaces } from '@/lib/hooks/api/use-workspaces';
import { usePlatformCapabilities } from '@/lib/hooks/api/use-platform-capabilities';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { CreateWorkspaceModal } from './create-workspace-modal';
import type { WorkspaceApi } from '@/types/api';

// Sits at the bottom of the sidebar navbar, replacing the header's old plain "Logout" link.
// Gives access to everything workspace-related that previously had no UI entry point at all:
// switching between workspaces, creating a new one, and Workspace Settings — plus logout.
export function WorkspaceMenu() {
  const currentWorkspace = useCurrentWorkspace();
  const { data: workspaces, isLoading } = useWorkspaces();
  const { data: capabilities } = usePlatformCapabilities();
  const { signOut } = useAuth();
  const router = useRouter();
  const [createModalOpened, setCreateModalOpened] = useState(false);

  const canCreateWorkspace = capabilities?.canCreateWorkspace ?? true;
  const isPlatformAdmin = capabilities?.isPlatformAdmin ?? false;

  const otherWorkspaces = (workspaces ?? []).filter((workspace) => workspace.id !== currentWorkspace.id);

  const handleLogout = async () => {
    // Await signOut before navigating so the homepage's server-side session check doesn't read
    // a stale authenticated cookie; a full navigation avoids the Router Cache reusing the
    // already-rendered authenticated shell (see the matching comment previously in
    // components/layout.tsx, and on the sign-in path in login-client.tsx).
    const success = await signOut();
    if (success) {
      globalThis.location.assign('/login');
    }
  };

  const handleCreated = (workspace: WorkspaceApi) => {
    setCreateModalOpened(false);
    router.push(`/${workspace.slug}/pages`);
  };

  return (
    <>
      <Menu position="top-start" width={240} shadow="md">
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="Workspace menu"
            style={{ width: '100%', justifyContent: 'flex-start', paddingInline: 8 }}
          >
            <Group gap="xs" wrap="nowrap" style={{ width: '100%' }}>
              <Avatar size="sm" radius="sm" color="blue">
                {currentWorkspace.name.charAt(0).toUpperCase()}
              </Avatar>
              <Text size="sm" fw={500} truncate style={{ flex: 1, textAlign: 'left' }}>
                {currentWorkspace.name}
              </Text>
              <IconChevronDown size={14} />
            </Group>
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>Workspaces</Menu.Label>
          <Menu.Item disabled leftSection={<Avatar size="xs" radius="sm" color="blue" />}>
            {currentWorkspace.name} (current)
          </Menu.Item>
          {isLoading && (
            <Menu.Item disabled leftSection={<Loader size="xs" />}>
              Loading…
            </Menu.Item>
          )}
          {otherWorkspaces.map((workspace) => (
            <Menu.Item
              key={workspace.id}
              component={Link}
              href={`/${workspace.slug}/pages`}
              leftSection={<Avatar size="xs" radius="sm" color="gray" />}
            >
              {workspace.name}
            </Menu.Item>
          ))}
          <Menu.Item
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateModalOpened(true)}
            hidden={!canCreateWorkspace}
          >
            New workspace
          </Menu.Item>
          <Menu.Item component={Link} href="/workspaces" leftSection={<IconLayoutGrid size={16} />}>
            Manage workspaces
          </Menu.Item>
          <Menu.Item component={Link} href="/notifications/settings" leftSection={<IconBellCog size={16} />}>
            Notification settings
          </Menu.Item>

          <Menu.Divider />

          {isPlatformAdmin && (
            <Menu.Item component={Link} href="/admin" leftSection={<IconShieldLock size={16} />}>
              Platform administration
            </Menu.Item>
          )}

          <Menu.Item
            component={Link}
            href={`/${currentWorkspace.slug}/settings`}
            leftSection={<IconSettings size={16} />}
          >
            Workspace settings
          </Menu.Item>
          <Menu.Item
            component={Link}
            href={`/${currentWorkspace.slug}/settings/apps`}
            leftSection={<IconKey size={16} />}
          >
            Apps
          </Menu.Item>
          <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={handleLogout}>
            Logout
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <CreateWorkspaceModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
