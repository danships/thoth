'use client';

import {
  Alert,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SlugAvailabilityIndicator } from '@/components/atoms/slug-availability-indicator';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useSlugAvailability } from '@/lib/hooks/api/use-slug-availability';
import { useStorageUsage } from '@/lib/hooks/api/use-storage-usage';
import { useWorkspaces } from '@/lib/hooks/api/use-workspaces';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import { workspaceSlugSchema } from '@/types/schemas/entities/workspace';
import type { UpdateWorkspaceBody, WorkspaceApi } from '@/types/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function WorkspaceSettingsPage() {
  const workspace = useCurrentWorkspace();
  useDocumentTitle('Settings');
  const router = useRouter();
  const { showSuccess, showError } = useNotification();
  const { patch, delete: remove, inProgress, error } = useCudApi();
  const { data: workspaces } = useWorkspaces();
  const { data: storageUsage, mutate: mutateStorageUsage } = useStorageUsage(workspace.id);
  const isOwner = workspace.role === 'owner';

  const form = useForm({
    initialValues: {
      name: workspace.name,
      slug: workspace.slug,
    },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Workspace name is required' : null),
      slug: (value) => (workspaceSlugSchema.safeParse(value).success ? null : 'Invalid slug format'),
    },
  });

  const quotaForm = useForm({
    initialValues: {
      storageQuotaBytes: workspace.storageQuotaBytes,
    },
    validate: {
      storageQuotaBytes: (value) =>
        Number.isSafeInteger(value) && value >= 0 ? null : 'Quota must be a non-negative whole number of bytes',
    },
  });
  const [quotaSubmitting, setQuotaSubmitting] = useState(false);

  const { availability, isBlocking } = useSlugAvailability(form.values.slug, {
    currentSlug: workspace.slug,
    excludeWorkspaceId: workspace.id,
  });

  const canDelete = (workspaces?.length ?? 0) > 1;

  const handleSubmit = async (values: typeof form.values) => {
    if (isBlocking) {
      return;
    }

    const body: UpdateWorkspaceBody = {};
    if (values.name.trim() !== workspace.name) {
      body.name = values.name.trim();
    }
    if (values.slug !== workspace.slug) {
      body.slug = values.slug;
    }

    if (Object.keys(body).length === 0) {
      return;
    }

    try {
      const updated = await patch<WorkspaceApi, UpdateWorkspaceBody>(`/workspaces/${workspace.id}`, body);
      showSuccess('Workspace updated');

      // Slug changed: the current URL (`/[oldSlug]/settings`) is now stale, so navigate to the
      // new one. The old slug keeps working too (via the WorkspaceSlugRedirect table), but the
      // browser should reflect the canonical URL going forward.
      if (updated.slug !== workspace.slug) {
        router.push(`/${updated.slug}/settings`);
      }
    } catch {
      // useCudApi already captured `error` for display below.
    }
  };

  const handleQuotaSubmit = async (values: typeof quotaForm.values) => {
    const currentQuotaBytes = storageUsage?.quotaBytes ?? workspace.storageQuotaBytes;
    if (values.storageQuotaBytes === currentQuotaBytes) {
      return;
    }
    setQuotaSubmitting(true);
    try {
      await patch<WorkspaceApi, UpdateWorkspaceBody>(`/workspaces/${workspace.id}`, {
        storageQuotaBytes: values.storageQuotaBytes,
      });
      showSuccess('Storage quota updated');
      await mutateStorageUsage();
    } catch {
      showError('Failed to update storage quota');
    } finally {
      setQuotaSubmitting(false);
    }
  };

  const handleDelete = () => {
    // Require the user to type the workspace name to confirm — a soft-delete is reversible for
    // 30 days, but this still hides the whole workspace, so it shouldn't be a single misclick.
    modals.open({
      modalId: 'delete-workspace',
      title: 'Delete workspace',
      children: <DeleteWorkspaceConfirm workspace={workspace} onConfirm={confirmDelete} />,
    });
  };

  const confirmDelete = async () => {
    modals.close('delete-workspace');
    try {
      await remove(`/workspaces/${workspace.id}`);
      showSuccess('Workspace deleted');
      const nextWorkspace = workspaces?.find((candidate) => candidate.id !== workspace.id);
      globalThis.location.assign(nextWorkspace ? `/${nextWorkspace.slug}/pages` : '/');
    } catch {
      showError('Failed to delete workspace');
    }
  };

  const usedBytes = storageUsage?.usedBytes ?? 0;
  const quotaBytes = storageUsage?.quotaBytes ?? workspace.storageQuotaBytes;
  const usagePercent = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;

  return (
    <Stack gap="xl" maw={560}>
      <Title order={2}>Workspace settings</Title>

      <Paper withBorder p="lg" radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            {error && (
              <Alert color="red" title="Error">
                {error}
              </Alert>
            )}

            <TextInput label="Workspace name" required {...form.getInputProps('name')} />

            <TextInput
              label="URL slug"
              description={`Your workspace lives at /${form.values.slug || workspace.slug}`}
              required
              {...form.getInputProps('slug')}
              rightSection={<SlugAvailabilityIndicator availability={availability} />}
              rightSectionWidth={80}
            />

            <Group justify="flex-end">
              <Button type="submit" loading={inProgress} disabled={isBlocking}>
                Save changes
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Title order={4}>Storage</Title>
          <Divider />
          <Text size="sm" c="dimmed">
            {formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used
          </Text>
          <Progress value={usagePercent} color={usagePercent >= 90 ? 'red' : 'blue'} aria-label="Storage usage" />

          {isOwner ? (
            <form onSubmit={quotaForm.onSubmit(handleQuotaSubmit)}>
              <Group align="flex-end" gap="sm">
                <NumberInput
                  label="Storage quota (bytes)"
                  aria-label="Storage quota in bytes"
                  min={0}
                  allowDecimal={false}
                  allowNegative={false}
                  {...quotaForm.getInputProps('storageQuotaBytes')}
                />
                <Button type="submit" loading={quotaSubmitting}>
                  Save quota
                </Button>
              </Group>
            </form>
          ) : (
            <Text size="sm" c="dimmed">
              Only the workspace owner can change the storage quota.
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Title order={4} c="red">
            Danger zone
          </Title>
          <Divider />
          <Group justify="space-between" align="center">
            <div>
              <Text fw={500}>Delete this workspace</Text>
              <Text size="sm" c="dimmed">
                {canDelete
                  ? 'Permanently deletes this workspace and everything in it (after a 30 day grace period).'
                  : "You can't delete your only workspace."}
              </Text>
            </div>
            <Button color="red" variant="outline" disabled={!canDelete} onClick={handleDelete}>
              Delete workspace
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

// Confirmation body requiring the user to type the workspace name exactly before the delete
// button enables — a deliberate friction step for a workspace-wide (if reversible) action.
function DeleteWorkspaceConfirm({
  workspace,
  onConfirm,
}: {
  workspace: { name: string };
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === workspace.name;

  return (
    <Stack gap="md">
      <Text size="sm">
        This workspace will be permanently deleted in 30 days. You can restore it from here until then. Type{' '}
        <strong>{workspace.name}</strong> to confirm.
      </Text>
      <TextInput
        aria-label="Confirm workspace name"
        placeholder={workspace.name}
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
        data-autofocus
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => modals.close('delete-workspace')}>
          Cancel
        </Button>
        <Button color="red" disabled={!matches} onClick={onConfirm}>
          Delete workspace
        </Button>
      </Group>
    </Stack>
  );
}
