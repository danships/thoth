'use client';

import { ActionIcon, Anchor, Box, Button, Group, Indicator, Popover, ScrollArea, Stack, Text } from '@mantine/core';
import { IconBell, IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { useNotificationUnreadCounts } from '@/lib/hooks/api/use-notification-unread-counts';
import { useNotifications } from '@/lib/hooks/api/use-notifications';
import { formatNotificationAge } from '@/lib/notifications/relative-time';
import classes from './notification-bell.module.css';

// Header bell (THOTH-066): an unread-count badge plus a popover of the latest inbox items, each
// linking to its server `openUrl` (a real navigation route that marks-read + redirects, so a
// plain anchor rather than a client route). Works in both the workspace shell and the global
// header — it is not scoped to a `[workspaceSlug]`.
export function NotificationBell() {
  const [opened, setOpened] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { showError } = useNotification();
  const { data: unreadCounts, mutate: mutateCounts } = useNotificationUnreadCounts();
  const { items, isLoading, refresh, setItems } = useNotifications({ limit: 10 });

  const total = unreadCounts?.total ?? 0;

  const handleOpen = (nextOpened: boolean) => {
    setOpened(nextOpened);
    if (nextOpened) {
      setNowMs(Date.now());
      void refresh();
    }
  };

  useEffect(() => {
    if (!opened) {
      return;
    }

    const interval = globalThis.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => globalThis.clearInterval(interval);
  }, [opened]);

  const handleMarkRead = async (id: string) => {
    try {
      const updated = await api.notifications.markRead(id, true);
      setItems((previous) => previous.map((item) => (item.id === id ? updated.data.data : item)));
      await mutateCounts();
    } catch {
      showError('Failed to mark notification as read');
    }
  };

  const renderItems = () => {
    if (isLoading && items.length === 0) {
      return (
        <Text size="sm" c="dimmed" py="md" ta="center">
          Loading…
        </Text>
      );
    }
    if (items.length === 0) {
      return (
        <Text size="sm" c="dimmed" py="md" ta="center">
          You have no notifications.
        </Text>
      );
    }
    return (
      <Stack gap={4}>
        {items.map((item) => {
          const age = formatNotificationAge(item.occurredAt, nowMs);

          return (
            <Box key={item.id} className={classes['item']} data-unread={item.readAt === null ? 'true' : undefined}>
              <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
                <Anchor href={item.openUrl} className={classes['itemLink']}>
                  <Text size="sm" fw={item.readAt === null ? 600 : 400} lineClamp={2}>
                    {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {item.body}
                  </Text>
                  {age && (
                    <Text
                      component="time"
                      className={classes['timestamp']}
                      size="xs"
                      c="dimmed"
                      dateTime={item.occurredAt}
                      title={new Date(item.occurredAt).toLocaleString()}
                    >
                      {age}
                    </Text>
                  )}
                </Anchor>
                {item.readAt === null && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Mark as read"
                    onClick={() => void handleMarkRead(item.id)}
                  >
                    <IconCheck size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Box>
          );
        })}
      </Stack>
    );
  };

  return (
    <Popover width={360} position="bottom-end" withArrow shadow="md" opened={opened} onChange={handleOpen}>
      <Popover.Target>
        <Indicator label={total > 99 ? '99+' : total} size={16} disabled={total === 0} color="red" offset={4}>
          <ActionIcon variant="subtle" color="gray" aria-label="Notifications" onClick={() => handleOpen(!opened)}>
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600}>Notifications</Text>
            <Anchor href="/notifications" size="sm">
              View all
            </Anchor>
          </Group>
          <ScrollArea.Autosize mah={360}>{renderItems()}</ScrollArea.Autosize>
          <Button component="a" href="/notifications" variant="light" size="xs" fullWidth>
            Open inbox
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
