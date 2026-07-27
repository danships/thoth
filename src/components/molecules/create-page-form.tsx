'use client';

import { Alert, Button, Container, Group, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRouter } from 'next/navigation';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { CreatePageBody, CreatePageResponse } from '@/types/api';

type CreatePageFormProperties = {
  parentId?: string | null;
  title?: string;
};

export function CreatePageForm({ parentId = null, title = 'Create New Page' }: CreatePageFormProperties) {
  const router = useRouter();
  const { post, inProgress, error } = useCudApi();
  const { id: workspaceId, slug: workspaceSlug } = useCurrentWorkspace();

  const form = useForm({
    initialValues: {
      name: '',
    },
    validate: {
      name: (value) => (value.length === 0 ? 'Page name is required' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    const page = await post<CreatePageResponse, CreatePageBody>('/pages', {
      name: values.name,
      emoji: null,
      parentId: parentId,
      // Only meaningful for root-level pages (the API derives the workspace from the parent
      // when `parentId` is set) — but always passing the *current* workspace here (rather than
      // relying on the server's "caller's first workspace" fallback) is what makes creating a
      // root page from within a non-default workspace actually create it there.
      workspaceId,
    });

    router.push(`/${workspaceSlug}/pages/${page.id}`);
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={1}>{title}</Title>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        <form noValidate onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput label="Page Name" placeholder="Enter page name" {...form.getInputProps('name')} required />

            <Group>
              <Button type="submit" loading={inProgress}>
                Create Page
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
