'use client';

import { useState } from 'react';
import { Combobox, Group, Text, useCombobox, CloseButton, Box, Loader, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
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

  // Stale/deleted option ids (and any accidental duplicates) are filtered out rather than
  // crashing — mirrors the defensive filtering used for single-select's stale value.
  const selectedOptions = value
    .filter((optionId, index, ids) => ids.indexOf(optionId) === index)
    .map((optionId) => options.find((option) => option.id === optionId))
    .filter((option): option is SingleSelectOption => option !== undefined);
  // Every update below is derived from this sanitized list instead of the raw `value` prop so a
  // stale/deleted option id already stored on the row is dropped rather than resubmitted.
  const selectedOptionIds = selectedOptions.map((option) => option.id);

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
      onChange([...selectedOptionIds, newOption.id]);
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
    if (selectedOptionIds.includes(optionId)) {
      onChange(selectedOptionIds.filter((id) => id !== optionId));
    } else {
      onChange([...selectedOptionIds, optionId]);
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
    onChange(selectedOptionIds.filter((id) => id !== optionId));
  };

  return (
    <Combobox store={combobox} onOptionSubmit={handleOptionSubmit} disabled={disabled}>
      {/*
       * Unlike the single-select cell, this target has to hold several independently
       * interactive `CloseButton`s alongside the "open dropdown" trigger. Nesting real buttons
       * inside a single `role="button"` container (the previous implementation) produces
       * invalid, ambiguously-focusable markup that mobile browsers handle inconsistently —
       * tapping to focus the search input inside the dropdown could bounce focus back to the
       * outer container and close the dropdown (and the on-screen keyboard) immediately.
       * `Combobox.DropdownTarget` anchors the dropdown to the whole pill container (click
       * anywhere in the cell still opens it), while a dedicated `Combobox.EventsTarget` button
       * — a sibling of the `CloseButton`s, not their ancestor — provides the keyboard-accessible
       * (Enter/Space) way to open it, per Mantine's supported pattern for custom Combobox
       * targets with independently removable controls.
       */}
      <Combobox.DropdownTarget>
        <Box
          className={styles['target'] ?? ''}
          onClick={() => !disabled && combobox.toggleDropdown()}
          data-testid="multi-select-cell-target"
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
            {!disabled && (
              <Combobox.EventsTarget targetType="button">
                <UnstyledButton
                  type="button"
                  className={styles['openTrigger'] ?? ''}
                  aria-label="Select options"
                  onClick={(event) => {
                    // Stop propagation so this button's own click (handled above by Mantine's
                    // keyboard-target wiring) doesn't also bubble up to the outer Box's onClick
                    // and toggle the dropdown a second time in the same interaction.
                    event.stopPropagation();
                    combobox.toggleDropdown();
                  }}
                >
                  <IconChevronDown size={14} />
                </UnstyledButton>
              </Combobox.EventsTarget>
            )}
          </Group>
        </Box>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search or create option"
        />
        <Combobox.Options>
          {filteredOptions.map((option) => (
            <Combobox.Option value={option.id} key={option.id} active={selectedOptionIds.includes(option.id)}>
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <SelectOptionBadge label={option.label} color={option.color} />
                {selectedOptionIds.includes(option.id) && (
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
