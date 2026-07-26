'use client';

import { Alert, Badge, Button, Divider, Group, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useWorkspaces } from '@/lib/hooks/api/use-workspaces';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { workspaceSlugSchema } from '@/types/schemas/entities/workspace';
import type { UpdateWorkspaceBody, WorkspaceApi } from '@/types/api';

type SlugAvailability = 'checking' | 'available' | 'taken' | 'unchanged' | 'invalid' | null;

function resolveSlugAvailability({
  slugChanged,
  slugFormatValid,
  isChecking,
  available,
}: {
  slugChanged: boolean;
  slugFormatValid: boolean;
  isChecking: boolean;
  available: boolean | undefined;
}): SlugAvailability {
  if (!slugChanged) {
    return 'unchanged';
  }
  if (!slugFormatValid) {
    return 'invalid';
  }
  if (isChecking || available === undefined) {
    return 'checking';
  }
  return available ? 'available' : 'taken';
}

function SlugAvailabilityIndicator({ availability }: { availability: SlugAvailability }) {
  if (availability === 'checking') {
    return <Loader size="xs" />;
  }
  if (availability === 'available') {
    return (
      <Badge color="teal" size="xs">
        Available
      </Badge>
    );
  }
  if (availability === 'taken') {
    return (
      <Badge color="red" size="xs">
        Taken
      </Badge>
    );
  }
  return null;
}

export default function WorkspaceSettingsPage() {
  const workspace = useCurrentWorkspace();
  const router = useRouter();
  const { showSuccess, showError } = useNotification();
  const { patch, delete: remove, inProgress, error } = useCudApi();
  const { data: workspaces } = useWorkspaces();

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

  const [debouncedSlug] = useDebouncedValue(form.values.slug, 400);
  // Keyed by the slug it was resolved for, so a stale in-flight result never gets shown for a
  // slug the user has since changed. `null` result means "not yet resolved for this slug".
  const [availabilityResult, setAvailabilityResult] = useState<{ slug: string; available: boolean } | null>(null);

  const slugChanged = debouncedSlug !== workspace.slug;
  const slugFormatValid = workspaceSlugSchema.safeParse(debouncedSlug).success;
  const isCheckingAvailability = slugChanged && slugFormatValid && availabilityResult?.slug !== debouncedSlug;

  useEffect(() => {
    if (!slugChanged || !slugFormatValid) {
      return;
    }

    let cancelled = false;

    api.workspaces
      .checkSlugAvailability(debouncedSlug, workspace.id)
      .then((response) => {
        if (!cancelled) {
          setAvailabilityResult({ slug: debouncedSlug, available: response.data.data.available });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailabilityResult(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSlug, slugChanged, slugFormatValid, workspace.id]);

  const effectiveSlugAvailability = resolveSlugAvailability({
    slugChanged,
    slugFormatValid,
    isChecking: isCheckingAvailability,
    available: availabilityResult?.slug === debouncedSlug ? availabilityResult.available : undefined,
  });

  const canDelete = (workspaces?.length ?? 0) > 1;

  const handleSubmit = async (values: typeof form.values) => {
    if (effectiveSlugAvailability === 'taken' || effectiveSlugAvailability === 'invalid') {
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

  const handleDelete = () => {
    modals.openConfirmModal({
      title: 'Delete workspace',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{workspace.name}</strong>? It will be kept for 30 days before being
          permanently removed, so you can restore it if this was a mistake.
        </Text>
      ),
      labels: { confirm: 'Delete workspace', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove(`/workspaces/${workspace.id}`);
          showSuccess('Workspace deleted');
          const nextWorkspace = workspaces?.find((candidate) => candidate.id !== workspace.id);
          globalThis.location.assign(nextWorkspace ? `/${nextWorkspace.slug}/pages` : '/');
        } catch {
          showError('Failed to delete workspace');
        }
      },
    });
  };

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
              rightSection={<SlugAvailabilityIndicator availability={effectiveSlugAvailability} />}
              rightSectionWidth={80}
            />

            <Group justify="flex-end">
              <Button
                type="submit"
                loading={inProgress}
                disabled={effectiveSlugAvailability === 'taken' || effectiveSlugAvailability === 'invalid'}
              >
                Save changes
              </Button>
            </Group>
          </Stack>
        </form>
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
