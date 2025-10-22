'use client';

import { Alert, Button, Container, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/provider';

export default function CreatePagePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      emoji: '',
    },
    validate: {
      name: (value) => (value.length === 0 ? 'Page name is required' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      await api.pages.create({
        name: values.name,
        emoji: values.emoji || null,
        parentId: null,
      });

      router.push('/pages');
    } catch (error_: any) {
      setError(error_.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <Container size="md" py="xl">
        <Text>Please log in to create pages.</Text>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={1}>Create New Page</Title>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput label="Page Name" placeholder="Enter page name" {...form.getInputProps('name')} />

            <TextInput label="Emoji" placeholder="📄" {...form.getInputProps('emoji')} />

            <Group>
              <Button type="submit" loading={loading}>
                Create Page
              </Button>
              <Button variant="outline" onClick={() => router.push('/pages')} disabled={loading}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
