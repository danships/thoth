'use client';

import { Alert, Button, CopyButton, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

type WebhookSecretModalProperties = {
  opened: boolean;
  secret: string | undefined;
  onClose: () => void;
};

// Shown exactly once, immediately after creating/rotating a webhook — mirrors
// `ApiKeyCreatedModal`. The signing secret can't be retrieved again after this modal closes;
// only a masked form (`secretMasked`) is shown afterwards.
export function WebhookSecretModal({ opened, secret, onClose }: WebhookSecretModalProperties) {
  return (
    <Modal opened={opened} onClose={onClose} title="Webhook secret" centered closeOnClickOutside={false}>
      <Stack gap="md">
        <Alert color="yellow" title="Copy this secret now">
          This is the only time this signing secret will be shown. Store it somewhere safe — it can&apos;t be retrieved
          again.
        </Alert>

        <TextInput readOnly value={secret ?? ''} aria-label="Webhook secret" />

        <Group justify="flex-end">
          <CopyButton value={secret ?? ''} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                color={copied ? 'teal' : 'blue'}
                leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy secret'}
              </Button>
            )}
          </CopyButton>
          <Button variant="default" onClick={onClose}>
            Done
          </Button>
        </Group>

        <Text size="sm" c="dimmed">
          Used to verify the <code>X-Thoth-Signature</code> header (HMAC-SHA256) on each delivery.
        </Text>
      </Stack>
    </Modal>
  );
}
