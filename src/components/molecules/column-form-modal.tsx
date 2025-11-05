import { Button, Checkbox, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { Column } from '@/types/schemas/entities/container';

const ALLOWED_TYPES = ['string', 'number', 'boolean', 'date'] as const;

type ColumnFormValues =
  | { name: string; type: 'string' }
  | { name: string; type: 'number' }
  | { name: string; type: 'boolean' }
  | { name: string; type: 'date'; options?: { dateFormat?: string; includeTime?: boolean } };

type ColumnFormModalProperties = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: ColumnFormValues) => Promise<void>;
  initialValues?: Column;
  title?: string;
  inProgress?: boolean;
  onError?: (error: unknown) => void;
};

export function ColumnFormModal({
  opened,
  onClose,
  onSubmit,
  initialValues,
  title = 'Add Column',
  inProgress = false,
  onError,
}: ColumnFormModalProperties) {
  const form = useForm<ColumnFormValues>({
    initialValues: {
      name: initialValues?.name ?? '',
      type: initialValues?.type ?? 'string',
      ...(initialValues?.type === 'date' && initialValues.options
        ? {
            options: {
              ...(initialValues.options.dateFormat ? { dateFormat: initialValues.options.dateFormat } : {}),
              ...(initialValues.options.includeTime === undefined
                ? {}
                : { includeTime: initialValues.options.includeTime }),
            },
          }
        : {}),
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Column name is required'),
      type: (value: 'string' | 'number' | 'boolean' | 'date') => {
        if (!value) {
          return 'Column type is required';
        }
        // TODO move this to a separate enum in the schema definition

        if (!ALLOWED_TYPES.includes(value)) {
          return 'Column type must be one of: string, number, boolean, date';
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
        ...(initialValues?.type === 'date' && initialValues.options
          ? {
              options: {
                ...(initialValues.options.dateFormat ? { dateFormat: initialValues.options.dateFormat } : {}),
                ...(initialValues.options.includeTime === undefined
                  ? {}
                  : { includeTime: initialValues.options.includeTime }),
              },
            }
          : {}),
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
      // Only include options for date type, and only if there are values
      const submitValues: ColumnFormValues = {
        ...values,
        ...(values.type === 'date' &&
        values.options &&
        (values.options.dateFormat || values.options.includeTime !== undefined)
          ? {
              options: {
                ...(values.options.dateFormat ? { dateFormat: values.options.dateFormat } : {}),
                ...(values.options.includeTime === undefined ? {} : { includeTime: values.options.includeTime }),
              },
            }
          : {}),
      };
      await onSubmit(submitValues);
      handleClose();
    } catch (error) {
      if (onError) {
        onError(error);
      }
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
              { value: 'date', label: 'Date' },
            ]}
            {...form.getInputProps('type')}
            required
          />
          {form.values.type === 'date' && (
            <>
              <TextInput
                label="Date Format"
                placeholder="e.g., MM/DD/YYYY, DD-MM-YYYY"
                description={
                  <Text>
                    Format string using{' '}
                    <a href="https://day.js.org/docs/en/display/format" target="_blank">
                      dayjs tokens
                    </a>{' '}
                    (optional)
                  </Text>
                }
                {...form.getInputProps('options.dateFormat')}
              />
              <Checkbox label="Include time" {...form.getInputProps('options.includeTime', { type: 'checkbox' })} />
            </>
          )}
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
