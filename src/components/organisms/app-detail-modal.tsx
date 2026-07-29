'use client';

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useApp } from '@/lib/hooks/api/use-app';
import { useAppWebhooks, useWebhookDeliveries } from '@/lib/hooks/api/use-app-webhooks';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { getAppScopeLabel } from '@/lib/format/app-scope-label';
import { ApiKeyCreatedModal } from './api-key-created-modal';
import { WebhookSecretModal } from './webhook-secret-modal';
import { WebhookDeliveriesTable } from './webhook-deliveries-table';
import { WebhookPayloadDocumentation } from './webhook-payload-documentation';
import type {
  CreateApiKeyBody,
  CreateApiKeyResponse,
  CreateWebhookBody,
  CreateWebhookResponse,
  UpdateWebhookBody,
  UpdateWebhookResponse,
  WebhookResponse,
} from '@/types/api';

type AppDetailModalProperties = {
  appId: string | undefined;
  onClose: () => void;
};

// The "manage keys" surface for a single App — shows its resolved scope, the owner label
// (`createdByDisplayName`, resolved via `resolveOwnerDisplay` on the server), and a table of
// keys with mint/revoke actions. Rotation is just "mint a new one, then revoke the old one".
export function AppDetailModal({ appId, onClose }: AppDetailModalProperties) {
  const { data: app, isLoading, mutate } = useApp(appId);
  const { data: webhooksData, mutate: mutateWebhooks } = useAppWebhooks(appId);
  const { post, patch, delete: remove } = useCudApi();
  const { showError, showSuccess } = useNotification();
  const [createdSecret, setCreatedSecret] = useState<string | undefined>(undefined);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | undefined>(undefined);
  const [editingWebhook, setEditingWebhook] = useState<WebhookResponse | undefined>(undefined);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | undefined>(undefined);
  const { data: deliveriesData, mutate: mutateDeliveries } = useWebhookDeliveries(appId, selectedWebhookId);

  const form = useForm({
    initialValues: { label: '', expiresAt: '' },
    validate: {
      expiresAt: (value) => (value && new Date(value).getTime() <= Date.now() ? 'Must be in the future' : null),
    },
  });

  const webhookForm = useForm({
    initialValues: { label: '', url: '', suppressOwnChanges: false },
    validate: {
      label: (value) => (value.trim() ? null : 'Label is required'),
      url: (value) => (value.trim().startsWith('https://') ? null : 'Must be an https:// URL'),
    },
  });

  const handleMintKey = async (values: typeof form.values) => {
    if (!appId) {
      return;
    }
    try {
      const body: CreateApiKeyBody = {
        ...(values.label.trim() && { label: values.label.trim() }),
        ...(values.expiresAt && { expiresAt: new Date(values.expiresAt).toISOString() }),
      };
      const created = await post<CreateApiKeyResponse, CreateApiKeyBody>(`/apps/${appId}/keys`, body);
      setCreatedSecret(created.secret);
      form.reset();
      await mutate();
    } catch {
      showError('Failed to create API key');
    }
  };

  const handleRevoke = (keyId: string) => {
    if (!appId) {
      return;
    }
    modals.openConfirmModal({
      title: 'Revoke key',
      children: <Text size="sm">This key will stop working immediately. This can&apos;t be undone.</Text>,
      labels: { confirm: 'Revoke', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove(`/apps/${appId}/keys/${keyId}`);
          showSuccess('Key revoked');
          await mutate();
        } catch {
          showError('Failed to revoke key');
        }
      },
    });
  };

  const handleCreateOrUpdateWebhook = async (values: typeof webhookForm.values) => {
    if (!appId) {
      return;
    }
    try {
      if (editingWebhook) {
        const body: UpdateWebhookBody = {
          label: values.label.trim(),
          url: values.url.trim(),
          suppressOwnChanges: values.suppressOwnChanges,
        };
        await patch<UpdateWebhookResponse, UpdateWebhookBody>(`/apps/${appId}/webhooks/${editingWebhook.id}`, body);
        showSuccess('Webhook updated');
      } else {
        const body: CreateWebhookBody = {
          label: values.label.trim(),
          url: values.url.trim(),
          suppressOwnChanges: values.suppressOwnChanges,
        };
        const created = await post<CreateWebhookResponse, CreateWebhookBody>(`/apps/${appId}/webhooks`, body);
        setCreatedWebhookSecret(created.secret);
      }
      webhookForm.reset();
      setEditingWebhook(undefined);
      await mutateWebhooks();
    } catch {
      showError(editingWebhook ? 'Failed to update webhook' : 'Failed to create webhook');
    }
  };

  const handleEditWebhook = (webhook: WebhookResponse) => {
    setEditingWebhook(webhook);
    webhookForm.setValues({ label: webhook.label, url: webhook.url, suppressOwnChanges: webhook.suppressOwnChanges });
  };

  const handleCancelEditWebhook = () => {
    setEditingWebhook(undefined);
    webhookForm.reset();
  };

  const handleToggleWebhookEnabled = async (webhook: WebhookResponse) => {
    if (!appId) {
      return;
    }
    try {
      await patch<UpdateWebhookResponse, UpdateWebhookBody>(`/apps/${appId}/webhooks/${webhook.id}`, {
        enabled: !webhook.enabled,
      });
      await mutateWebhooks();
    } catch {
      showError('Failed to update webhook');
    }
  };

  const handleDeleteWebhook = (webhook: WebhookResponse) => {
    if (!appId) {
      return;
    }
    modals.openConfirmModal({
      title: 'Delete webhook',
      children: (
        <Text size="sm">
          This deletes &quot;{webhook.label}&quot; and its delivery history. This can&apos;t be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove(`/apps/${appId}/webhooks/${webhook.id}`);
          if (selectedWebhookId === webhook.id) {
            setSelectedWebhookId(undefined);
          }
          showSuccess('Webhook deleted');
          await mutateWebhooks();
        } catch {
          showError('Failed to delete webhook');
        }
      },
    });
  };

  const handleResendDelivery = async (deliveryId: string) => {
    if (!appId || !selectedWebhookId) {
      return;
    }
    try {
      await post(`/apps/${appId}/webhooks/${selectedWebhookId}/deliveries/${deliveryId}/resend`);
      await mutateDeliveries();
    } catch {
      showError('Failed to resend delivery');
    }
  };

  return (
    <>
      <Modal
        opened={Boolean(appId)}
        onClose={onClose}
        title={app ? app.label : 'App'}
        size="lg"
        centered
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        {isLoading && <Loader />}
        {app && (
          <Stack gap="lg">
            <Group gap="xs">
              <Badge color={app.permission === 'read_write' ? 'blue' : 'gray'}>{app.permission}</Badge>
              <Badge variant="light">{getAppScopeLabel(app.scopeType)}</Badge>
              <Badge variant="light">Created by {app.createdByDisplayName}</Badge>
              {app.archivedAt && <Badge color="red">Archived</Badge>}
            </Group>

            <div>
              <Title order={5} mb="xs">
                Keys
              </Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Label</Table.Th>
                    <Table.Th>Prefix</Table.Th>
                    <Table.Th>Last used</Table.Th>
                    <Table.Th>Expires</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {app.keys.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">
                          No keys yet.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {app.keys.map((key) => (
                    <Table.Tr key={key.id}>
                      <Table.Td>{key.label}</Table.Td>
                      <Table.Td>
                        <code>{key.keyPrefix}…</code>
                      </Table.Td>
                      <Table.Td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</Table.Td>
                      <Table.Td>{key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}</Table.Td>
                      <Table.Td>
                        {key.revokedAt ? (
                          <Badge color="red" variant="light">
                            Revoked
                          </Badge>
                        ) : (
                          <Badge color="teal" variant="light">
                            Active
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {!key.revokedAt && !app.archivedAt && (
                          <Tooltip label="Revoke key">
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              aria-label="Revoke key"
                              onClick={() => handleRevoke(key.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>

            {!app.archivedAt && (
              <form onSubmit={form.onSubmit(handleMintKey)}>
                <Group align="flex-end" gap="sm">
                  <TextInput label="New key label" placeholder="prod" {...form.getInputProps('label')} />
                  <TextInput
                    label="Expires at"
                    description="Leave empty for a key that never expires"
                    type="datetime-local"
                    {...form.getInputProps('expiresAt')}
                  />
                  <Button type="submit">Create key</Button>
                </Group>
              </form>
            )}

            <div>
              <Title order={5} mb="xs">
                Webhooks
              </Title>
              <WebhookPayloadDocumentation />
              <Table mt="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Label</Table.Th>
                    <Table.Th>URL</Table.Th>
                    <Table.Th>Secret</Table.Th>
                    <Table.Th>Enabled</Table.Th>
                    <Table.Th>Suppress own changes</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(webhooksData?.webhooks ?? []).length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">
                          No webhooks yet.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {(webhooksData?.webhooks ?? []).map((webhook) => (
                    <Table.Tr
                      key={webhook.id}
                      onClick={() => setSelectedWebhookId(webhook.id)}
                      style={{ cursor: 'pointer', fontWeight: selectedWebhookId === webhook.id ? 600 : undefined }}
                    >
                      <Table.Td>{webhook.label}</Table.Td>
                      <Table.Td>
                        <Text size="sm" truncate maw={220}>
                          {webhook.url}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <code>{webhook.secretMasked}</code>
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={webhook.enabled}
                          onChange={(event) => {
                            event.stopPropagation();
                            void handleToggleWebhookEnabled(webhook);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Toggle ${webhook.label} enabled`}
                          disabled={Boolean(app.archivedAt)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={webhook.suppressOwnChanges ? 'blue' : 'gray'}>
                          {webhook.suppressOwnChanges ? 'On' : 'Off'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {!app.archivedAt && (
                          <Group gap="xs" onClick={(event) => event.stopPropagation()}>
                            <Tooltip label="Edit webhook">
                              <ActionIcon
                                variant="subtle"
                                aria-label="Edit webhook"
                                onClick={() => handleEditWebhook(webhook)}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete webhook">
                              <ActionIcon
                                color="red"
                                variant="subtle"
                                aria-label="Delete webhook"
                                onClick={() => handleDeleteWebhook(webhook)}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>

            {!app.archivedAt && (
              <form onSubmit={webhookForm.onSubmit(handleCreateOrUpdateWebhook)}>
                <Stack gap="sm">
                  <Group align="flex-end" gap="sm">
                    <TextInput label="Label" placeholder="Production" {...webhookForm.getInputProps('label')} />
                    <TextInput
                      label="URL"
                      placeholder="https://example.com/webhooks/thoth"
                      style={{ flex: 1 }}
                      {...webhookForm.getInputProps('url')}
                    />
                  </Group>
                  <Switch
                    label="Suppress notifications for changes made through this App's own key"
                    checked={webhookForm.values.suppressOwnChanges}
                    onChange={(event) => webhookForm.setFieldValue('suppressOwnChanges', event.currentTarget.checked)}
                  />
                  <Group>
                    <Button type="submit">{editingWebhook ? 'Save webhook' : 'Add webhook'}</Button>
                    {editingWebhook && (
                      <Button variant="default" onClick={handleCancelEditWebhook}>
                        Cancel
                      </Button>
                    )}
                  </Group>
                </Stack>
              </form>
            )}

            {selectedWebhookId && (
              <div>
                <Title order={5} mb="xs">
                  Deliveries
                </Title>
                <WebhookDeliveriesTable deliveries={deliveriesData?.deliveries ?? []} onResend={handleResendDelivery} />
              </div>
            )}
          </Stack>
        )}
      </Modal>

      <ApiKeyCreatedModal
        opened={Boolean(createdSecret)}
        secret={createdSecret}
        onClose={() => setCreatedSecret(undefined)}
      />

      <WebhookSecretModal
        opened={Boolean(createdWebhookSecret)}
        secret={createdWebhookSecret}
        onClose={() => setCreatedWebhookSecret(undefined)}
      />
    </>
  );
}
