'use client';

import { Container, Stack, Title } from '@mantine/core';

export default function Home() {
  return (
    <Container size="md" py="xl">
      <Stack>
        <Title order={1}>Welcome to Thoth</Title>
      </Stack>
    </Container>
  );
}
