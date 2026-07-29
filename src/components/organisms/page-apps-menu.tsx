'use client';

import { ActionIcon, Badge, Box, Divider, Group, Loader, Menu, Text, Tooltip } from '@mantine/core';
import { IconDots, IconLink, IconPlugConnected, IconUnlink } from '@tabler/icons-react';
import { usePageApps } from '@/lib/hooks/api/use-page-apps';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { getAppScopeLabel } from '@/lib/format/app-scope-label';
import type { ConnectPageAppResponse, ConnectedPageApp, PageAppSummary } from '@/types/api';

type PageAppsMenuProperties = {
  pageId: string;
};

// The badge shown next to a connected App: where its access comes from. Extracted to a plain
// function to avoid a nested ternary in the JSX.
function connectedBadgeLabel(app: ConnectedPageApp): string {
  if (app.viaWorkspace) {
    return 'Workspace';
  }
  if (app.viaInheritance) {
    return 'Inherited';
  }
  return getAppScopeLabel(app.scopeType);
}

// A small "three dots" menu, shown below the page header, listing the Apps (see THOTH-026)
// that currently have access to this page ("Connected") plus any other non-workspace-scoped
// Apps in the workspace that could be granted access ("Connect an App"). Connecting an App to a
// page implicitly grants it access to the data sources embedded on the page, so data sources
// are never managed here — only the page's own connections.
export function PageAppsMenu({ pageId }: PageAppsMenuProperties) {
  const { data, isLoading, mutate } = usePageApps(pageId);
  const { post, delete: remove, inProgress } = useCudApi();
  const { showError, showSuccess } = useNotification();

  const handleConnect = async (app: PageAppSummary) => {
    try {
      await post<ConnectPageAppResponse>(`/pages/${pageId}/apps`, { appId: app.id });
      showSuccess(`Connected "${app.label}"`);
      await mutate();
    } catch {
      showError(`Failed to connect "${app.label}"`);
    }
  };

  const handleDisconnect = async (app: PageAppSummary) => {
    try {
      await remove(`/pages/${pageId}/apps/${app.id}`);
      showSuccess(`Disconnected "${app.label}"`);
      await mutate();
    } catch {
      showError(`Failed to disconnect "${app.label}"`);
    }
  };

  const connected = data?.connected ?? [];
  const connectable = data?.connectable ?? [];

  return (
    <Menu shadow="md" width={300} closeOnItemClick={false} position="bottom-end">
      <Menu.Target>
        <Tooltip label="Apps">
          <ActionIcon variant="subtle" color="gray" aria-label="Apps for this page">
            <IconDots size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Connected apps</Menu.Label>
        {isLoading && (
          <Menu.Item disabled leftSection={<Loader size="xs" />}>
            Loading…
          </Menu.Item>
        )}
        {!isLoading && connected.length === 0 && <Menu.Item disabled>No apps connected</Menu.Item>}
        {connected.map((app) => {
          // Workspace- and inheritance-granted connections can't be removed from here — they come
          // from the App's scope, not a direct grant on this page.
          const locked = app.viaWorkspace || app.viaInheritance === true;
          return (
            // A plain row (not `Menu.Item`, which renders a `<button>`) — its only interactive
            // element is the disconnect `ActionIcon`, and nesting a button inside a button is
            // invalid HTML (and breaks hydration).
            <Box key={app.id} px="sm" py={6}>
              <Group gap={6} wrap="nowrap" justify="space-between">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconPlugConnected size={14} style={{ flexShrink: 0 }} />
                  <Text size="sm" truncate>
                    {app.label}
                  </Text>
                  <Badge size="xs" variant="light">
                    {connectedBadgeLabel(app)}
                  </Badge>
                </Group>
                {!locked && (
                  <Tooltip label="Disconnect">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      aria-label={`Disconnect ${app.label}`}
                      disabled={inProgress}
                      onClick={() => void handleDisconnect(app)}
                    >
                      <IconUnlink size={12} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Box>
          );
        })}

        <Divider my={4} />

        <Menu.Label>Connect an app</Menu.Label>
        {!isLoading && connectable.length === 0 && <Menu.Item disabled>No other apps to connect</Menu.Item>}
        {connectable.map((app) => (
          <Menu.Item
            key={app.id}
            leftSection={<IconLink size={14} />}
            disabled={inProgress}
            onClick={() => void handleConnect(app)}
          >
            <Group gap={6} wrap="nowrap">
              <Text size="sm" truncate>
                {app.label}
              </Text>
              <Badge size="xs" variant="light">
                {getAppScopeLabel(app.scopeType)}
              </Badge>
            </Group>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
