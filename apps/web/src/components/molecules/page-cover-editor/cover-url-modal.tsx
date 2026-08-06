import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

type CoverUrlModalProperties = {
  opened: boolean;
  value: string;
  isValid: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

/**
 * Small modal used to set/replace the page cover's image URL, shared by the "Add cover" entry
 * point and the "Change image" action inside `ManageCoverModal`.
 */
export function CoverUrlModal({ opened, value, isValid, onChange, onClose, onSubmit }: CoverUrlModalProperties) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Page cover image"
      centered
      closeButtonProps={{ 'aria-label': 'Close', icon: <IconX size={16} /> }}
    >
      <Stack gap="md">
        <TextInput
          label="Image URL"
          placeholder="https://example.com/image.jpg"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          error={value.length > 0 && !isValid ? 'Enter a valid http(s) URL' : null}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!isValid}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
