'use client';

import { useRef, useState } from 'react';
import { ActionIcon, Badge, Box, Divider, Group, Loader, Menu, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDots,
  IconFilePlus,
  IconFileImport,
  IconHistory,
  IconLink,
  IconLock,
  IconLockOpen,
  IconPlugConnected,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUnlink,
  IconBell,
  IconCheck,
} from '@tabler/icons-react';
import { usePageApps } from '@/lib/hooks/api/use-page-apps';
import { useNotificationSubscriptions } from '@/lib/hooks/api/use-notification-subscriptions';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { api } from '@/lib/api/client';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { getAppScopeLabel } from '@/lib/format/app-scope-label';
import type {
  ConnectPageAppResponse,
  ConnectedPageApp,
  PageAppSummary,
  PutPageNotificationSubscriptionBody,
} from '@/types/api';

// Matches the server's `setPageContentBodySchema` cap (`z.string().max(1_000_000)`) so an
// oversized file is rejected client-side with a friendly message instead of a 400 round-trip.
const MAX_IMPORT_CONTENT_LENGTH = 1_000_000;

type PageDetailMenuProperties = {
  pageId: string;
  hasContent: boolean;
  starred: boolean;
  isPrivate: boolean;
  isTogglingFavorite?: boolean;
  onToggleFavorite: () => void | Promise<void>;
  onTogglePrivate: () => void | Promise<void>;
  onImportMarkdown: (markdown: string) => Promise<void>;
  onAddChildPage: () => void;
  onMoveToTrash?: () => Promise<void>;
  onViewHistory?: () => void;
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

const PAGE_NOTIFICATION_OPTIONS: { value: PutPageNotificationSubscriptionBody['kind']; label: string }[] = [
  { value: 'page', label: 'Subscribe to this page' },
  { value: 'tree', label: 'Subscribe to this page & sub-pages' },
  { value: 'exclude_page', label: 'Exclude this page' },
  { value: 'exclude_tree', label: 'Exclude this page & sub-pages' },
  { value: 'none', label: 'Clear page rule' },
];

// The page detail screen's "three dots" menu. Hosts two independent concerns:
//  - "App connections" (see THOTH-026): a nested submenu listing the Apps that currently have
//    access to this page ("Connected") plus any other non-workspace-scoped Apps in the
//    workspace that could be granted access ("Connect an app"). Connecting an App to a page
//    implicitly grants it access to the data sources embedded on the page, so data sources are
//    never managed here — only the page's own connections.
//  - "Import from Markdown" (THOTH-041): lets the user replace the page's content by picking a
//    local `.md`/`.markdown` file, parsed entirely client-side via BlockNote.
export function PageDetailMenu({
  pageId,
  hasContent,
  starred,
  isPrivate,
  isTogglingFavorite,
  onToggleFavorite,
  onTogglePrivate,
  onImportMarkdown,
  onAddChildPage,
  onMoveToTrash,
  onViewHistory,
}: PageDetailMenuProperties) {
  const { data, isLoading, mutate } = usePageApps(pageId);
  const workspace = useCurrentWorkspace();
  const { data: subscriptionsData, mutate: mutateSubscriptions } = useNotificationSubscriptions(workspace.id);
  const { post, delete: remove, inProgress } = useCudApi();
  const { showError, showSuccess } = useNotification();
  const fileInputReference = useRef<HTMLInputElement>(null);
  const [menuOpened, setMenuOpened] = useState(false);

  const currentPageRuleKind = subscriptionsData?.subscriptions.find((rule) => rule.containerId === pageId)?.kind;
  // Serializes notification-rule writes: while a mutation for this page is pending, the menu
  // items are disabled so a second, out-of-order click can never clobber the in-flight write's
  // result.
  const [pageNotificationMutationPending, setPageNotificationMutationPending] = useState(false);

  const handleSetPageNotification = async (kind: PutPageNotificationSubscriptionBody['kind']) => {
    setPageNotificationMutationPending(true);
    try {
      await api.notifications.setPageSubscription(pageId, kind);
      showSuccess(kind === 'none' ? 'Cleared page notification rule' : 'Updated page notification rule');
      await mutateSubscriptions();
    } catch {
      showError('Failed to update notification rule');
    } finally {
      setPageNotificationMutationPending(false);
    }
  };

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

  const handleMoveToTrash = () => {
    if (!onMoveToTrash) {
      return;
    }

    setMenuOpened(false);
    modals.openConfirmModal({
      title: 'Move page to Trash',
      children: (
        <Text size="sm">This page and its nested content will be moved to Trash. You can restore it later.</Text>
      ),
      labels: { confirm: 'Move to Trash', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await onMoveToTrash();
        } catch {
          showError('Failed to move page to Trash');
        }
      },
    });
  };

  const handleTogglePrivate = () => {
    setMenuOpened(false);
    modals.openConfirmModal({
      title: isPrivate ? 'Remove from private' : 'Make page & sub-pages private',
      children: (
        <Text size="sm">
          {isPrivate
            ? 'This page and its sub-pages will show up again in Recent and Search.'
            : 'This page and its sub-pages will be hidden from Recent and Search — not a permission change. Anyone with access can still open it directly, from the page tree, or from Favorites.'}
        </Text>
      ),
      labels: { confirm: isPrivate ? 'Remove from private' : 'Make private', cancel: 'Cancel' },
      onConfirm: async () => {
        try {
          await onTogglePrivate();
        } catch {
          showError('Failed to update page privacy');
        }
      },
    });
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
      <Menu
        shadow="md"
        width={300}
        closeOnItemClick={false}
        position="bottom-end"
        opened={menuOpened}
        onChange={setMenuOpened}
      >
        <Menu.Target>
          <Tooltip label="Menu">
            <ActionIcon variant="subtle" color="gray" aria-label="Page menu">
              <IconDots size={18} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>

        <Menu.Dropdown>
          {onViewHistory && (
            <Menu.Item
              leftSection={<IconHistory size={14} />}
              onClick={onViewHistory}
              data-testid="page-history-button"
            >
              View History
            </Menu.Item>
          )}

          <Menu.Item
            leftSection={
              starred ? <IconStarFilled size={14} color="var(--mantine-color-yellow-6)" /> : <IconStar size={14} />
            }
            disabled={isTogglingFavorite ?? false}
            onClick={() => void onToggleFavorite()}
            data-testid="page-favorite-toggle-button"
          >
            {starred ? 'Unstar Page' : 'Star Page'}
          </Menu.Item>

          <Menu.Item
            leftSection={isPrivate ? <IconLockOpen size={14} /> : <IconLock size={14} />}
            onClick={handleTogglePrivate}
            data-testid="page-private-toggle-button"
          >
            {isPrivate ? 'Remove from private' : 'Make page & sub-pages private'}
          </Menu.Item>

          <Menu.Item leftSection={<IconFilePlus size={14} />} onClick={onAddChildPage}>
            Add Child Page
          </Menu.Item>

          <Menu.Item leftSection={<IconFileImport size={14} />} onClick={handleImportClick}>
            Import from Markdown
          </Menu.Item>
          {onMoveToTrash && (
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={handleMoveToTrash}>
              Move to Trash
            </Menu.Item>
          )}

          {/* `closeDelay` guards against the hover-based submenu closing itself the instant a
              connect/disconnect click shrinks or grows the dropdown: with no delay, the cursor
              can end up outside the resized floating panel mid-click, and Mantine's `useHover`
              would immediately treat that as "mouse left" and close the submenu before the
              updated (dis)connected row ever renders. */}
          <Menu.Sub position="right-start" closeDelay={1000}>
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

          <Menu.Sub position="right-start">
            <Menu.Sub.Target>
              <Menu.Sub.Item leftSection={<IconBell size={14} />}>Notifications</Menu.Sub.Item>
            </Menu.Sub.Target>

            <Menu.Sub.Dropdown>
              <Menu.Label>Notify me about this page</Menu.Label>
              {PAGE_NOTIFICATION_OPTIONS.map((option) => (
                <Menu.Item
                  key={option.value}
                  leftSection={
                    (currentPageRuleKind ?? 'none') === option.value ? <IconCheck size={14} /> : <Box w={14} />
                  }
                  disabled={pageNotificationMutationPending}
                  onClick={() => void handleSetPageNotification(option.value)}
                >
                  {option.label}
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
