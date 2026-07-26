'use client';

import { Alert, Button, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import type { CreateWorkspaceBody, WorkspaceApi } from '@/types/api';

type CreateWorkspaceModalProperties = {
  opened: boolean;
  onClose: () => void;
  onCreated: (workspace: WorkspaceApi) => void;
};

// Deliberately only asks for a name — the slug is auto-derived (and de-duplicated) server-side
// on creation. Renaming the workspace or picking a custom slug happens afterwards, from
// Workspace Settings, where slug availability can be checked live.
export function CreateWorkspaceModal({ opened, onClose, onCreated }: CreateWorkspaceModalProperties) {
  const { post, inProgress, error } = useCudApi();

  const form = useForm({
    initialValues: { name: '' },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Workspace name is required' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    const workspace = await post<WorkspaceApi, CreateWorkspaceBody>('/workspaces', { name: values.name.trim() });
    form.reset();
    onCreated(workspace);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create workspace"
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
          <TextInput
            label="Workspace name"
            placeholder="e.g. Personal, Acme Inc."
            data-autofocus
            required
            {...form.getInputProps('name')}
          />
          <Button type="submit" loading={inProgress}>
            Create workspace
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
