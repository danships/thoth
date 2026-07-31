import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import type { Column, DateMode } from '@/types/schemas/entities/container';
import { getPresetsForMode, getDefaultFormatForMode } from '@/lib/data-source/date-format';
import {
  SingleSelectOptionsEditor,
  type SingleSelectOptionDraft,
} from '@/components/molecules/single-select-options-editor';

type ColumnFormValues = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'single-select' | 'multi-select';
  mode: DateMode;
  displayFormat: string;
  options: SingleSelectOptionDraft[];
};

type ColumnFormModalProperties = {
  opened: boolean;
  onClose: () => void;
  onSubmit: (values: ColumnFormValues) => Promise<void>;
  initialValues?: Column;
  title?: string;
  inProgress?: boolean;
  onError?: (error: unknown) => void;
};

function getInitialOptions(initialValues: Column | undefined): SingleSelectOptionDraft[] {
  return initialValues?.type === 'single-select' || initialValues?.type === 'multi-select'
    ? initialValues.options.map((option) => ({ ...option }))
    : [];
}

function hasDuplicateOptionLabels(options: SingleSelectOptionDraft[]): boolean {
  const seen = new Set<string>();
  for (const option of options) {
    const normalized = option.label.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return true;
    }
    seen.add(normalized);
  }
  return false;
}

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
      mode: initialValues?.type === 'date' ? initialValues.mode : 'date',
      displayFormat: initialValues?.type === 'date' ? initialValues.displayFormat : getDefaultFormatForMode('date'),
      options: getInitialOptions(initialValues),
    },
    validate: {
      name: (value) => (value.trim() ? null : 'Column name is required'),
      type: (value) => (value ? null : 'Column type is required'),
      mode: (value, values) => (values.type === 'date' && !value ? 'Mode is required for date columns' : null),
      displayFormat: (value, values) =>
        values.type === 'date' && !value ? 'Display format is required for date columns' : null,
      options: (value, values) => {
        if (values.type !== 'single-select' && values.type !== 'multi-select') {
          return null;
        }
        if (value.some((option) => !option.label.trim())) {
          return 'All options must have a label';
        }
        if (hasDuplicateOptionLabels(value)) {
          return 'Option labels must be unique';
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
        mode: initialValues?.type === 'date' ? initialValues.mode : 'date',
        displayFormat: initialValues?.type === 'date' ? initialValues.displayFormat : getDefaultFormatForMode('date'),
        options: getInitialOptions(initialValues),
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
      if (onError) {
        onError(error);
      }
    }
  };

  const handleTypeChange = (value: string | null) => {
    const newType = (value ?? 'string') as ColumnFormValues['type'];
    form.setFieldValue('type', newType);
    if (newType === 'date') {
      const currentMode = form.values.mode ?? 'date';
      form.setFieldValue('displayFormat', getDefaultFormatForMode(currentMode));
    }
    // Single-select and multi-select columns can be created with zero options — options are
    // typically added inline from the table cell (via the "+ Create" option in the dropdown)
    // rather than being required up-front here.
  };

  const handleModeChange = (value: string | null) => {
    const newMode = (value ?? 'date') as DateMode;
    form.setFieldValue('mode', newMode);
    form.setFieldValue('displayFormat', getDefaultFormatForMode(newMode));
  };

  const formatPresets = getPresetsForMode(form.values.mode ?? 'date').map((p) => ({
    value: p.value,
    label: p.label,
  }));

  return (
    <Modal opened={opened} onClose={handleClose} title={title} centered closeButtonProps={{ 'aria-label': 'Close' }}>
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
              { value: 'single-select', label: 'Single select' },
              { value: 'multi-select', label: 'Multi select' },
            ]}
            {...form.getInputProps('type')}
            onChange={handleTypeChange}
            required
          />
          {form.values.type === 'date' && (
            <>
              <Select
                label="Date Mode"
                data={[
                  { value: 'date', label: 'Date' },
                  { value: 'time', label: 'Time' },
                  { value: 'datetime', label: 'Date & Time' },
                ]}
                {...form.getInputProps('mode')}
                onChange={handleModeChange}
                required
              />
              <Select label="Display Format" data={formatPresets} {...form.getInputProps('displayFormat')} required />
            </>
          )}
          {(form.values.type === 'single-select' || form.values.type === 'multi-select') && (
            <SingleSelectOptionsEditor
              options={form.values.options}
              onChange={(options) => form.setFieldValue('options', options)}
            />
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
