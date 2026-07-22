'use client';

import { useState } from 'react';
import { Combobox, Group, Text, useCombobox, CloseButton, Box, Loader } from '@mantine/core';
import { SelectOptionBadge } from '@/components/atoms/select-option-badge';
import type { SingleSelectOption } from '@/types/schemas/entities/container';
import styles from './editable-single-select-cell.module.css';

type EditableSingleSelectCellProperties = {
  value: string | null;
  options: SingleSelectOption[];
  onChange: (optionId: string | null) => void;
  onCreateOption: (label: string) => Promise<SingleSelectOption>;
  disabled?: boolean;
};

/**
 * Editable single-select cell backed by Mantine's `Combobox` (the plain `Select` component
 * doesn't support creatable options). Displays the current value as a `SelectOptionBadge`,
 * lists all configured options, supports typing to filter, and offers a "+ Create '<text>'"
 * item when the typed text doesn't case-insensitively match any existing option.
 */
export function EditableSingleSelectCell({
  value,
  options,
  onChange,
  onCreateOption,
  disabled = false,
}: EditableSingleSelectCellProperties) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch('');
    },
  });

  // Stale/deleted option ids are treated as "no selection" rather than crashing — mirrors the
  // defensive filtering already used elsewhere for stale column/option references.
  const selectedOption = options.find((option) => option.id === value) ?? null;

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
      onChange(newOption.id);
      combobox.closeDropdown();
      setSearch('');
    } finally {
      setCreating(false);
    }
  };

  const handleOptionSubmit = (optionValue: string) => {
    if (optionValue === '$create') {
      void handleCreate();
      return;
    }

    onChange(optionValue);
    combobox.closeDropdown();
    setSearch('');
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(null);
  };

  return (
    <Combobox store={combobox} onOptionSubmit={handleOptionSubmit} disabled={disabled}>
      <Combobox.Target>
        <Box
          className={styles['target'] ?? ''}
          onClick={() => !disabled && combobox.toggleDropdown()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          data-testid="single-select-cell-target"
        >
          <Group gap="xs" wrap="nowrap" justify="space-between" w="100%">
            {selectedOption ? (
              <SelectOptionBadge label={selectedOption.label} color={selectedOption.color} />
            ) : (
              <Text c="dimmed" size="sm">
                —
              </Text>
            )}
            {selectedOption && !disabled && <CloseButton size="sm" onClick={handleClear} aria-label="Clear" />}
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
            <Combobox.Option value={option.id} key={option.id}>
              <SelectOptionBadge label={option.label} color={option.color} />
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
