'use client';

import { Alert, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import type { AppResponse, CreateAppBody, UpdateAppBody } from '@/types/api';

type AppFormModalProperties = {
  opened: boolean;
  workspaceId: string;
  app?: AppResponse | undefined;
  onClose: () => void;
  onSaved: (app: AppResponse) => void;
};

// Shared create/edit form for an App's configuration (label, permission, scope, attribution).
// Key minting/rotation is handled separately in the App detail view — this modal only ever
// touches `App` fields, never a key's secret. Container scoping (pages *and* data sources) is
// handled entirely from each container's own page detail "Apps" menu, so this form never sends
// `containerIds` and can't clobber grants made there.
export function AppFormModal({ opened, workspaceId, app, onClose, onSaved }: AppFormModalProperties) {
  const { post, patch, inProgress, error } = useCudApi();
  const isEditing = Boolean(app);

  const form = useForm({
    initialValues: {
      label: app?.label ?? '',
      permission: app?.permission ?? 'read',
      scopeType: app?.scopeType ?? 'workspace',
      attributionMode: app?.attributionMode ?? 'creator',
    },
    validate: {
      label: (value) => (value.trim().length === 0 ? 'Label is required' : null),
    },
  });

  // `useForm`'s `initialValues` are only applied on mount, so when this modal is reused to edit
  // different Apps (or switch between "new" and an existing App) we need to explicitly
  // re-populate the form whenever it's opened, mirroring the pattern in `ColumnFormModal`.
  useEffect(() => {
    if (opened) {
      form.setValues({
        label: app?.label ?? '',
        permission: app?.permission ?? 'read',
        scopeType: app?.scopeType ?? 'workspace',
        attributionMode: app?.attributionMode ?? 'creator',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, app]);

  const handleSubmit = async (values: typeof form.values) => {
    try {
      if (isEditing && app) {
        const body: UpdateAppBody = {
          label: values.label.trim(),
          permission: values.permission,
          scopeType: values.scopeType,
          attributionMode: values.attributionMode,
        };
        const updated = await patch<AppResponse, UpdateAppBody>(`/apps/${app.id}`, body);
        onSaved(updated);
      } else {
        const body: CreateAppBody = {
          workspaceId,
          label: values.label.trim(),
          permission: values.permission,
          scopeType: values.scopeType,
          attributionMode: values.attributionMode,
        };
        const created = await post<AppResponse, CreateAppBody>('/apps', body);
        onSaved(created);
      }
    } catch {
      // useCudApi already captured `error` for display below.
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? 'Edit App' : 'New App'}
      centered
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}

          <TextInput label="Label" placeholder="CI Pipeline" required data-autofocus {...form.getInputProps('label')} />

          <Select
            label="Permission"
            data={[
              { value: 'read', label: 'Read only' },
              { value: 'read_write', label: 'Read & write' },
            ]}
            allowDeselect={false}
            {...form.getInputProps('permission')}
          />

          <Select
            label="Scope"
            description="Pages and data sources are granted access individually, from each page's own Apps menu"
            data={[
              { value: 'workspace', label: 'Entire workspace' },
              { value: 'containers', label: 'Specific pages and/or data sources' },
              { value: 'containers_with_children', label: 'Specific pages and/or data sources + descendants' },
            ]}
            allowDeselect={false}
            {...form.getInputProps('scopeType')}
          />

          <Select
            label="Attribution"
            description="Whose identity is used for content created through this App's keys"
            data={[
              { value: 'creator', label: 'The person who created this App' },
              { value: 'app', label: 'This App itself' },
            ]}
            allowDeselect={false}
            {...form.getInputProps('attributionMode')}
          />

          <Group justify="flex-end">
            <Button type="submit" loading={inProgress}>
              {isEditing ? 'Save changes' : 'Create App'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
