'use client';

import { useRef } from 'react';
import { ActionIcon, Badge, Box, Divider, Group, Loader, Menu, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconDots, IconFilePlus, IconFileImport, IconLink, IconPlugConnected, IconUnlink } from '@tabler/icons-react';
import { usePageApps } from '@/lib/hooks/api/use-page-apps';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { getAppScopeLabel } from '@/lib/format/app-scope-label';
import type { ConnectPageAppResponse, ConnectedPageApp, PageAppSummary } from '@/types/api';

// Matches the server's `setPageContentBodySchema` cap (`z.string().max(1_000_000)`) so an
// oversized file is rejected client-side with a friendly message instead of a 400 round-trip.
const MAX_IMPORT_CONTENT_LENGTH = 1_000_000;

type PageDetailMenuProperties = {
  pageId: string;
  hasContent: boolean;
  onImportMarkdown: (markdown: string) => Promise<void>;
  onAddChildPage: () => void;
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

// The page detail screen's "three dots" menu. Hosts two independent concerns:
//  - "App connections" (see THOTH-026): a nested submenu listing the Apps that currently have
//    access to this page ("Connected") plus any other non-workspace-scoped Apps in the
//    workspace that could be granted access ("Connect an app"). Connecting an App to a page
//    implicitly grants it access to the data sources embedded on the page, so data sources are
//    never managed here — only the page's own connections.
//  - "Import from Markdown" (THOTH-041): lets the user replace the page's content by picking a
//    local `.md`/`.markdown` file, parsed entirely client-side via BlockNote.
export function PageDetailMenu({ pageId, hasContent, onImportMarkdown, onAddChildPage }: PageDetailMenuProperties) {
  const { data, isLoading, mutate } = usePageApps(pageId);
  const { post, delete: remove, inProgress } = useCudApi();
  const { showError, showSuccess } = useNotification();
  const fileInputReference = useRef<HTMLInputElement>(null);

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

  const handleImportClick = () => {
    fileInputReference.current?.click();
  };

  const runImport = async (markdown: string) => {
    try {
      await onImportMarkdown(markdown);
      showSuccess('Imported markdown file');
    } catch {
      showError('Failed to import markdown file');
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still fires a `change` event.
    event.target.value = '';
    if (!file) {
      return;
    }

    let markdown: string;
    try {
      markdown = await file.text();
    } catch {
      showError('Failed to read file');
      return;
    }

    if (markdown.length > MAX_IMPORT_CONTENT_LENGTH) {
      showError('File is too large to import (max 1 MB)');
      return;
    }

    if (hasContent) {
      modals.openConfirmModal({
        title: 'Replace page content?',
        children: (
          <Text size="sm">
            Importing this file will replace the page&apos;s current content. This can&apos;t be undone.
          </Text>
        ),
        labels: { confirm: 'Replace', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => void runImport(markdown),
      });
      return;
    }

    await runImport(markdown);
  };

  const connected = data?.connected ?? [];
  const connectable = data?.connectable ?? [];

  return (
    <>
      <Menu shadow="md" width={300} closeOnItemClick={false} position="bottom-end">
        <Menu.Target>
          <Tooltip label="Menu">
            <ActionIcon variant="subtle" color="gray" aria-label="Page menu">
              <IconDots size={18} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item leftSection={<IconFilePlus size={14} />} onClick={onAddChildPage}>
            Add Child Page
          </Menu.Item>

          <Menu.Item leftSection={<IconFileImport size={14} />} onClick={handleImportClick}>
            Import from Markdown
          </Menu.Item>

          {/* `closeDelay` guards against the hover-based submenu closing itself the instant a
              connect/disconnect click shrinks or grows the dropdown: with no delay, the cursor
              can end up outside the resized floating panel mid-click, and Mantine's `useHover`
              would immediately treat that as "mouse left" and close the submenu before the
              updated (dis)connected row ever renders. */}
          <Menu.Sub position="right-start" closeDelay={300}>
            <Menu.Sub.Target>
              <Menu.Sub.Item leftSection={<IconPlugConnected size={14} />}>App connections</Menu.Sub.Item>
            </Menu.Sub.Target>

            <Menu.Sub.Dropdown>
              <Menu.Label>Connected apps</Menu.Label>
              {isLoading && (
                <Menu.Item disabled leftSection={<Loader size="xs" />}>
                  Loading…
                </Menu.Item>
              )}
              {!isLoading && connected.length === 0 && <Menu.Item disabled>No apps connected</Menu.Item>}
              {connected.map((app) => {
                // Workspace- and inheritance-granted connections can't be removed from here — they
                // come from the App's scope, not a direct grant on this page.
                const locked = app.viaWorkspace || app.viaInheritance === true;
                return (
                  // A plain row (not `Menu.Item`, which renders a `<button>`) — its only
                  // interactive element is the disconnect `ActionIcon`, and nesting a button
                  // inside a button is invalid HTML (and breaks hydration).
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
            </Menu.Sub.Dropdown>
          </Menu.Sub>
        </Menu.Dropdown>
      </Menu>

      <input
        ref={fileInputReference}
        type="file"
        accept=".md,.markdown"
        style={{ display: 'none' }}
        onChange={(event) => void handleFileSelected(event)}
      />
    </>
  );
}
