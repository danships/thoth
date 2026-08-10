'use client';

import { Alert, Button, CopyButton, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

type ApiKeyCreatedModalProperties = {
  opened: boolean;
  secret: string | undefined;
  onClose: () => void;
};

// Shown exactly once, immediately after minting a key — `secret` is never retrievable again
// after this modal is dismissed (only `keyPrefix` is stored/displayed afterwards).
export function ApiKeyCreatedModal({ opened, secret, onClose }: ApiKeyCreatedModalProperties) {
  return (
    <Modal opened={opened} onClose={onClose} title="API key created" centered closeOnClickOutside={false}>
      <Stack gap="md">
        <Alert color="yellow" title="Copy this key now">
          This is the only time this key will be shown. Store it somewhere safe — it can&apos;t be retrieved again.
        </Alert>

        <TextInput readOnly value={secret ?? ''} aria-label="API key secret" />

        <Group justify="flex-end">
          <CopyButton value={secret ?? ''} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                color={copied ? 'teal' : 'blue'}
                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy key'}
              </Button>
            )}
          </CopyButton>
          <Button variant="default" onClick={onClose}>
            Done
          </Button>
        </Group>

        <Text size="sm" c="dimmed">
          Use it as a bearer token: <code>Authorization: Bearer {'{key}'}</code>
        </Text>
      </Stack>
    </Modal>
  );
}
