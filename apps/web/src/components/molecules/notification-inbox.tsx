'use client';

import { Anchor, Badge, Box, Button, Group, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { useNotifications } from '@/lib/hooks/api/use-notifications';
import { useNotificationUnreadCounts } from '@/lib/hooks/api/use-notification-unread-counts';
import type { NotificationResponse } from '@/types/api';
import classes from './notification-inbox.module.css';
import { EnableBrowserPushCard } from './enable-browser-push-card';

type NotificationInboxProperties = {
  workspaceId?: string;
  title?: string;
};

// Shared inbox list used by both the global (`/notifications`) and workspace-scoped
// (`/[workspaceSlug]/notifications`) pages (THOTH-066). Supports an unread-only filter,
// per-item + bulk mark-read, cursor "load more", and a link to each item's server `openUrl`.
export function NotificationInbox({ workspaceId, title = 'Notifications' }: NotificationInboxProperties) {
  const { showError, showSuccess } = useNotification();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { items, setItems, isLoading, loadingMore, hasMore, loadMore, refresh } = useNotifications({
    ...(workspaceId ? { workspaceId } : {}),
    unreadOnly,
    limit: 20,
  });
  const { mutate: mutateCounts } = useNotificationUnreadCounts();

  const markRead = async (item: NotificationResponse) => {
    try {
      const updated = await api.notifications.markRead(item.id, item.readAt === null);
      setItems((previous) => previous.map((existing) => (existing.id === item.id ? updated.data.data : existing)));
      await mutateCounts();
    } catch {
      showError('Failed to update notification');
    }
  };

  const markAllRead = async () => {
    try {
      const result = await api.notifications.readAll(workspaceId);
      const updatedCount = result.data.data.updated;
      showSuccess(updatedCount === 0 ? 'No unread notifications' : `Marked ${updatedCount} as read`);
      await Promise.all([refresh(), mutateCounts()]);
    } catch {
      showError('Failed to mark all as read');
    }
  };

  const renderList = () => {
    if (isLoading && items.length === 0) {
      return <Text c="dimmed">Loading…</Text>;
    }
    if (items.length === 0) {
      return <Text c="dimmed">You have no notifications.</Text>;
    }
    return (
      <Stack gap="xs">
        {items.map((item) => (
          <Paper
            key={item.id}
            withBorder
            p="sm"
            radius="md"
            className={classes['item']}
            data-unread={item.readAt === null ? 'true' : undefined}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Box className={classes['body']}>
                <Group gap="xs">
                  <Anchor href={item.openUrl} fw={item.readAt === null ? 600 : 400}>
                    {item.title}
                  </Anchor>
                  {item.readAt === null && (
                    <Badge size="xs" color="blue">
                      New
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {item.body}
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(item.occurredAt).toLocaleString()}
                </Text>
              </Box>
              <Button variant="subtle" size="xs" onClick={() => void markRead(item)}>
                {item.readAt === null ? 'Mark read' : 'Mark unread'}
              </Button>
            </Group>
          </Paper>
        ))}
      </Stack>
    );
  };

  return (
    <Stack gap="md" maw={720}>
      <Group justify="space-between" align="center">
        <Title order={2}>{title}</Title>
        <Group gap="sm">
          <Switch
            label="Unread only"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.currentTarget.checked)}
          />
          <Button variant="light" size="xs" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        </Group>
      </Group>

      <Text size="sm" c="dimmed">
        Notifications are sent according to the rules configured for a workspace, on that workspace&apos;s settings
        page. You can further tune what you receive for an individual page from the page&apos;s menu, where you can
        subscribe (or unsubscribe) to that page alone or to it and all of its sub-pages.
      </Text>

      {/* THOTH-071: sole call site for the browser permission prompt. */}
      <EnableBrowserPushCard />

      {renderList()}

      {hasMore && (
        <Group justify="center">
          <Button variant="default" loading={loadingMore} onClick={() => void loadMore()}>
            Load more
          </Button>
        </Group>
      )}
    </Stack>
  );
}
