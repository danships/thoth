import { ActionIcon, Button, Group, Select, Stack, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { SELECT_COLOR_OPTIONS } from '@/lib/data-source/select-colors';
import type { SelectColor } from '@/types/schemas/entities/container';
import styles from './single-select-options-editor.module.css';

// A row being edited locally. `id` is present for options that already exist on the column
// (loaded from `initialValues`). Brand-new rows added via "Add option" get a client-generated
// id (`crypto.randomUUID()`, set by the caller before calling `onChange`) so the row has a
// stable React key and so the id is ready to send as part of a full-replace PATCH when the
// column is saved — the PATCH handler persists client-supplied ids for new options verbatim
// and never attempts to regenerate them (only POST /columns and POST /columns/:id/options,
// which are fully server-driven creation flows, generate ids server-side).
export type SingleSelectOptionDraft = {
  id: string;
  label: string;
  color: SelectColor;
};

type SingleSelectOptionsEditorProperties = {
  options: SingleSelectOptionDraft[];
  onChange: (options: SingleSelectOptionDraft[]) => void;
};

function nextUnusedColor(options: SingleSelectOptionDraft[]): SelectColor {
  const usedColors = new Set(options.map((option) => option.color));
  const unused = SELECT_COLOR_OPTIONS.find((colorOption) => !usedColors.has(colorOption.value));
  return (unused ?? SELECT_COLOR_OPTIONS[options.length % SELECT_COLOR_OPTIONS.length])!.value;
}

function optionErrorMessage(option: SingleSelectOptionDraft, duplicate: boolean): string | null {
  if (duplicate) {
    return 'Duplicate label';
  }
  return option.label.trim() === '' ? 'Label is required' : null;
}

function hasDuplicateLabel(options: SingleSelectOptionDraft[], index: number): boolean {
  const label = options[index]?.label.trim().toLowerCase();
  if (!label) {
    return false;
  }
  return options.some((option, otherIndex) => otherIndex !== index && option.label.trim().toLowerCase() === label);
}

/**
 * List editor for a single-select column's options: one row per option (label + color +
 * delete), no drag-handle/reorder control (out of scope — options are always appended and
 * display in current array order). Deletion is immediate with no confirmation dialog; existing
 * page values referencing a deleted option's id become orphaned (tracked in TECH_DEBT.md).
 */
export function SingleSelectOptionsEditor({ options, onChange }: SingleSelectOptionsEditorProperties) {
  const handleAddOption = () => {
    onChange([...options, { id: crypto.randomUUID(), label: '', color: nextUnusedColor(options) }]);
  };

  const handleLabelChange = (index: number, label: string) => {
    onChange(options.map((option, currentIndex) => (currentIndex === index ? { ...option, label } : option)));
  };

  const handleColorChange = (index: number, color: string | null) => {
    onChange(
      options.map((option, currentIndex) =>
        currentIndex === index ? { ...option, color: (color ?? option.color) as SelectColor } : option
      )
    );
  };

  const handleRemove = (index: number) => {
    onChange(options.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <Stack gap="xs" className={styles['optionsEditor'] ?? ''}>
      {options.map((option, index) => {
        const duplicate = hasDuplicateLabel(options, index);
        return (
          <Group key={option.id} gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              placeholder="Option label"
              value={option.label}
              onChange={(event) => handleLabelChange(index, event.currentTarget.value)}
              error={optionErrorMessage(option, duplicate)}
              style={{ flex: 1 }}
            />
            <Select
              data={SELECT_COLOR_OPTIONS}
              value={option.color}
              onChange={(value) => handleColorChange(index, value)}
              allowDeselect={false}
              w={130}
              aria-label={`Color for option ${index + 1}`}
            />
            <ActionIcon
              type="button"
              color="red"
              variant="subtle"
              onClick={() => handleRemove(index)}
              aria-label={`Remove option ${index + 1}`}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        );
      })}
      <Button type="button" variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={handleAddOption}>
        Add option
      </Button>
    </Stack>
  );
}
