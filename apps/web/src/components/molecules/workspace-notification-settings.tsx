'use client';

import { useState } from 'react';
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

  // Serializes writes per control: while a mutation is pending, its control is disabled so a
  // second, out-of-order write can never clobber the in-flight one's result.
  const [workspaceMutationPending, setWorkspaceMutationPending] = useState(false);
  const [pendingPageRuleIds, setPendingPageRuleIds] = useState<ReadonlySet<string>>(new Set());

  const handleToggleWorkspace = async (checked: boolean) => {
    setWorkspaceMutationPending(true);
    try {
      await api.notifications.setWorkspaceSubscription(workspace.id, checked ? 'workspace' : 'none');
      showSuccess(checked ? 'Subscribed to this workspace' : 'Unsubscribed from this workspace');
      await mutate();
    } catch {
      showError('Failed to update workspace subscription');
    } finally {
      setWorkspaceMutationPending(false);
    }
  };

  const handleChangePageRule = async (pageId: string, kind: PutPageNotificationSubscriptionBody['kind']) => {
    setPendingPageRuleIds((previous) => new Set(previous).add(pageId));
    try {
      await api.notifications.setPageSubscription(pageId, kind);
      showSuccess('Page rule updated');
      await mutate();
    } catch {
      showError('Failed to update page rule');
    } finally {
      setPendingPageRuleIds((previous) => {
        const next = new Set(previous);
        next.delete(pageId);
        return next;
      });
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
          disabled={workspaceMutationPending}
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
                  disabled={pendingPageRuleIds.has(rule.containerId)}
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
