'use client';

import { Divider, Group, Paper, Select, Stack, Switch, Text, Title } from '@mantine/core';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { useNotificationSubscriptions } from '@/lib/hooks/api/use-notification-subscriptions';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import type { NotificationRuleResponse, PutPageNotificationSubscriptionBody } from '@/types/api';

const PAGE_RULE_OPTIONS: { value: PutPageNotificationSubscriptionBody['kind']; label: string }[] = [
  { value: 'page', label: 'This page only' },
  { value: 'tree', label: 'This page and its sub-pages' },
  { value: 'exclude_page', label: 'Exclude this page' },
  { value: 'exclude_tree', label: 'Exclude this page and its sub-pages' },
  { value: 'none', label: 'No rule (remove)' },
];

// Workspace-settings section (THOTH-066): a workspace-level subscribe toggle plus a summary of
// the caller's page-level rules, each editable/removable. Rules are per-user state.
export function WorkspaceNotificationSettings() {
  const workspace = useCurrentWorkspace();
  const { showError, showSuccess } = useNotification();
  const { data, mutate } = useNotificationSubscriptions(workspace.id);

  const subscriptions = data?.subscriptions ?? [];
  const workspaceRule = subscriptions.find((rule) => rule.containerId === null);
  const pageRules = subscriptions.filter(
    (rule): rule is NotificationRuleResponse & { containerId: string } => rule.containerId !== null
  );
  const workspaceSubscribed = workspaceRule?.kind === 'workspace';

  const handleToggleWorkspace = async (checked: boolean) => {
    try {
      await api.notifications.setWorkspaceSubscription(workspace.id, checked ? 'workspace' : 'none');
      showSuccess(checked ? 'Subscribed to this workspace' : 'Unsubscribed from this workspace');
      await mutate();
    } catch {
      showError('Failed to update workspace subscription');
    }
  };

  const handleChangePageRule = async (pageId: string, kind: PutPageNotificationSubscriptionBody['kind']) => {
    try {
      await api.notifications.setPageSubscription(pageId, kind);
      showSuccess('Page rule updated');
      await mutate();
    } catch {
      showError('Failed to update page rule');
    }
  };

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="sm">
        <Title order={4}>Notifications</Title>
        <Divider />
        <Switch
          label="Notify me about all page changes in this workspace"
          description="You can still exclude specific pages below."
          checked={workspaceSubscribed}
          onChange={(event) => void handleToggleWorkspace(event.currentTarget.checked)}
        />

        <Text fw={500} mt="sm">
          Page rules
        </Text>
        {pageRules.length === 0 ? (
          <Text size="sm" c="dimmed">
            No page-specific rules. Use the page menu on any page to subscribe or exclude it.
          </Text>
        ) : (
          <Stack gap="xs">
            {pageRules.map((rule) => (
              <Group key={rule.id} justify="space-between" wrap="nowrap">
                <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                  {rule.containerId}
                </Text>
                <Select
                  aria-label="Page rule"
                  data={PAGE_RULE_OPTIONS}
                  value={rule.kind}
                  allowDeselect={false}
                  onChange={(value) =>
                    value &&
                    void handleChangePageRule(rule.containerId, value as PutPageNotificationSubscriptionBody['kind'])
                  }
                  w={280}
                />
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
