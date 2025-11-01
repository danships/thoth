import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { Column } from '@/types/schemas/entities/container';

type ColumnFormValues = {
  name: string;
  type: 'string' | 'number' | 'boolean';
};

type ColumnFormModalProperties = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: ColumnFormValues) => Promise<void>;
  initialValues?: Column;
  title?: string;
  inProgress?: boolean;
};

export function ColumnFormModal({
  opened,
  onClose,
  onSubmit,
  initialValues,
  title = 'Add Column',
  inProgress = false,
}: ColumnFormModalProperties) {
  const form = useForm<ColumnFormValues>({
    initialValues: {
      name: initialValues?.name ?? '',
      type: initialValues?.type ?? 'string',
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Column name is required'),
      type: (value) => {
        if (!value) {
          return 'Column type is required';
        }
        // TODO move this to a separate enum in the schema definition
        const allowedTypes: ('string' | 'number' | 'boolean')[] = ['string', 'number', 'boolean'];
        if (!allowedTypes.includes(value)) {
          return 'Column type must be one of: string, number, boolean';
        }
        return null;
      },
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        name: initialValues?.name ?? '',
        type: initialValues?.type ?? 'string',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialValues]);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSubmit = async (values: ColumnFormValues) => {
    try {
      await onSubmit(values);
      handleClose();
    } catch (error) {
      console.error('Failed to save column:', error);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title={title} centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput label="Column Name" placeholder="Enter column name" {...form.getInputProps('name')} required />
          <Select
            label="Column Type"
            data={[
              { value: 'string', label: 'Text' },
              { value: 'number', label: 'Number' },
              { value: 'boolean', label: 'Checkbox' },
            ]}
            {...form.getInputProps('type')}
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={inProgress}>
              {initialValues ? 'Update Column' : 'Create Column'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
