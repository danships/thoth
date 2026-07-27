'use client';

import { Alert, Button, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { SlugAvailabilityIndicator } from '@/components/atoms/slug-availability-indicator';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useSlugAvailability } from '@/lib/hooks/api/use-slug-availability';
import { slugify } from '@/lib/utils/slug';
import { workspaceSlugSchema } from '@/types/schemas/entities/workspace';
import type { CreateWorkspaceBody, WorkspaceApi } from '@/types/api';

type WorkspaceCreateFormProperties = {
  onCreated: (workspace: WorkspaceApi) => void;
  submitLabel?: string;
  autoFocus?: boolean;
};

/**
 * Shared workspace creation form (name + editable, live-validated slug). Used both by the
 * quick-create modal in the sidebar switcher and the dedicated `/workspaces/new` page. The slug
 * field is pre-filled from the name via `slugify` until the user edits it directly, after which
 * it stops tracking the name.
 */
export function WorkspaceCreateForm({
  onCreated,
  submitLabel = 'Create workspace',
  autoFocus,
}: WorkspaceCreateFormProperties) {
  const { post, inProgress, error } = useCudApi();
  const [slugEdited, setSlugEdited] = useState(false);

  const form = useForm({
    initialValues: { name: '', slug: '' },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Workspace name is required' : null),
      slug: (value) =>
        workspaceSlugSchema.safeParse(value).success
          ? null
          : 'Slug must be 3-50 lowercase letters, numbers, or hyphens',
    },
  });

  const { availability, isBlocking } = useSlugAvailability(form.values.slug);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const name = event.currentTarget.value;
    form.setFieldValue('name', name);
    if (!slugEdited) {
      form.setFieldValue('slug', slugify(name));
    }
  };

  const handleSlugChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSlugEdited(true);
    form.setFieldValue('slug', event.currentTarget.value);
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (isBlocking) {
      return;
    }
    const body: CreateWorkspaceBody = { name: values.name.trim() };
    if (values.slug.trim().length > 0) {
      body.slug = values.slug.trim();
    }
    try {
      const workspace = await post<WorkspaceApi, CreateWorkspaceBody>('/workspaces', body);
      form.reset();
      setSlugEdited(false);
      onCreated(workspace);
    } catch {
      // useCudApi captured `error` for display below (e.g. a 409 slug collision that slipped
      // past the live check).
    }
  };

  return (
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
          data-autofocus={autoFocus ? true : undefined}
          required
          {...form.getInputProps('name')}
          onChange={handleNameChange}
        />
        <TextInput
          label="URL slug"
          description={`Your workspace will live at /${form.values.slug || 'your-slug'}`}
          required
          {...form.getInputProps('slug')}
          onChange={handleSlugChange}
          rightSection={<SlugAvailabilityIndicator availability={availability} />}
          rightSectionWidth={80}
        />
        <Button type="submit" loading={inProgress} disabled={isBlocking}>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  );
}
