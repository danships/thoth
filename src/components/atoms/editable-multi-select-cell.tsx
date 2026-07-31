'use client';

import { useState } from 'react';
import { Combobox, Group, Text, useCombobox, CloseButton, Box, Loader } from '@mantine/core';
import { SelectOptionBadge } from '@/components/atoms/select-option-badge';
import { useNotification } from '@/lib/hooks/use-notification';
import type { SingleSelectOption } from '@/types/schemas/entities/container';
import styles from './editable-multi-select-cell.module.css';

type EditableMultiSelectCellProperties = {
  value: string[];
  options: SingleSelectOption[];
  onChange: (optionIds: string[]) => void;
  onCreateOption: (label: string) => Promise<SingleSelectOption>;
  disabled?: boolean;
};

/**
 * Editable multi-select cell backed by Mantine's `Combobox`, mirroring
 * `EditableSingleSelectCell` (same option model, palette, badges, and inline "+ Create" flow)
 * but holding an ordered array of option ids instead of a single nullable id. Selecting a
 * currently-selected option toggles it off (rather than replacing the selection), and the
 * dropdown stays open across submissions so multiple options can be picked in one interaction.
 */
export function EditableMultiSelectCell({
  value,
  options,
  onChange,
  onCreateOption,
  disabled = false,
}: EditableMultiSelectCellProperties) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const { showError } = useNotification();
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch('');
    },
  });

  // Stale/deleted option ids are filtered out rather than crashing — mirrors the defensive
  // filtering used for single-select's stale value.
  const selectedOptions = value
    .map((optionId) => options.find((option) => option.id === optionId))
    .filter((option): option is SingleSelectOption => option !== undefined);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedSearch))
    : options;

  const exactMatch = options.some((option) => option.label.trim().toLowerCase() === normalizedSearch);
  const showCreateOption = normalizedSearch.length > 0 && !exactMatch;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const newOption = await onCreateOption(search.trim());
      onChange([...value, newOption.id]);
      setSearch('');
    } catch (error) {
      // Surface the failure via the shared notification system rather than swallowing it —
      // otherwise the dropdown stays open with no feedback and looks like nothing happened.
      showError(error instanceof Error ? error.message : 'Failed to create option');
    } finally {
      setCreating(false);
    }
  };

  const toggleOption = (optionId: string) => {
    if (value.includes(optionId)) {
      onChange(value.filter((id) => id !== optionId));
    } else {
      onChange([...value, optionId]);
    }
  };

  const handleOptionSubmit = (optionValue: string) => {
    // Ignore selection/creation while a create request is in flight so a newer selection can't
    // race with — and be overwritten by — the pending create's `onChange` call.
    if (creating) {
      return;
    }

    if (optionValue === '$create') {
      void handleCreate();
      return;
    }

    toggleOption(optionValue);
    setSearch('');
  };

  const handleRemove = (event: React.MouseEvent, optionId: string) => {
    event.stopPropagation();
    onChange(value.filter((id) => id !== optionId));
  };

  return (
    <Combobox store={combobox} onOptionSubmit={handleOptionSubmit} disabled={disabled}>
      <Combobox.Target>
        <Box
          className={styles['target'] ?? ''}
          onClick={() => !disabled && combobox.toggleDropdown()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          data-testid="multi-select-cell-target"
          // Explicit label so this element's accessible name doesn't shift based on its
          // pill/close-button descendants (their labels would otherwise be included in the
          // computed name for a role="button" element with no explicit label).
          aria-label="Select options"
        >
          <Group gap="xs" wrap="wrap" className={styles['pillWrap'] ?? ''} justify="space-between" w="100%">
            {selectedOptions.length > 0 ? (
              <Group gap={4} wrap="wrap">
                {selectedOptions.map((option) => (
                  <Group key={option.id} gap={2} wrap="nowrap">
                    <SelectOptionBadge label={option.label} color={option.color} />
                    {!disabled && (
                      <CloseButton
                        size="xs"
                        onClick={(event) => handleRemove(event, option.id)}
                        aria-label={`Remove ${option.label}`}
                      />
                    )}
                  </Group>
                ))}
              </Group>
            ) : (
              <Text c="dimmed" size="sm">
                —
              </Text>
            )}
          </Group>
        </Box>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search or create option"
        />
        <Combobox.Options>
          {filteredOptions.map((option) => (
            <Combobox.Option value={option.id} key={option.id} active={value.includes(option.id)}>
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <SelectOptionBadge label={option.label} color={option.color} />
                {value.includes(option.id) && (
                  <Text size="xs" c="dimmed">
                    Selected
                  </Text>
                )}
              </Group>
            </Combobox.Option>
          ))}
          {showCreateOption && (
            <Combobox.Option value="$create">
              {creating ? <Loader size="xs" /> : `+ Create "${search.trim()}"`}
            </Combobox.Option>
          )}
          {filteredOptions.length === 0 && !showCreateOption && (
            <Combobox.Empty>No options yet — type to create one</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
