/* eslint-disable unicorn/no-nested-ternary */
'use client';

import { DatePicker, DateTimePicker } from '@mantine/dates';
import { Popover } from '@mantine/core';
import dayjs from 'dayjs';
import { useState } from 'react';

type EditableDateCellProperties = {
  value: string | null | undefined;
  onBlur: (value: string) => void;
  disabled?: boolean;
  options?: {
    dateFormat?: string;
    includeTime?: boolean;
  };
};

export function EditableDateCell({ value, onBlur, disabled = false, options }: EditableDateCellProperties) {
  const [opened, setOpened] = useState(false);
  const includeTime = options?.includeTime ?? false;
  const dateFormat = options?.dateFormat;

  // Parse ISO string to Date object for value prop, or null if empty
  const dateValue = value ? dayjs(value).toDate() : null;

  // Convert to string format for DatePicker/DateTimePicker (they expect Date or string)
  const dateValueString = value || null;

  // Format display value
  const displayValue =
    dateValue && dateFormat
      ? dayjs(dateValue).format(dateFormat)
      : dateValue
        ? includeTime
          ? dayjs(dateValue).format('YYYY-MM-DD HH:mm')
          : dayjs(dateValue).format('YYYY-MM-DD')
        : '';

  const handleChange = (value: string | null) => {
    if (!value) {
      // If date is cleared, send empty string
      onBlur('');
      setOpened(false);
      return;
    }

    // Parse the string value (could be formatted date string from picker)
    const parsedDate = dayjs(value);
    if (!parsedDate.isValid()) {
      // If invalid, try to use the value as-is
      onBlur(value);
      setOpened(false);
      return;
    }

    // Convert to ISO string format
    // If includeTime is false, only include date part (YYYY-MM-DD)
    if (includeTime) {
      const dateTime = parsedDate.toISOString();
      onBlur(dateTime);
    } else {
      const dateOnly = parsedDate.format('YYYY-MM-DD');
      onBlur(dateOnly);
    }
    setOpened(false);
  };

  const handleClick = () => {
    if (!disabled) {
      setOpened(true);
    }
  };

  if (includeTime) {
    return (
      <Popover opened={opened} onChange={setOpened} position="bottom-start" withArrow disabled={disabled}>
        <Popover.Target>
          <div
            onClick={handleClick}
            style={{
              minWidth: 120,
              outline: 'none',
              cursor: disabled ? 'default' : 'pointer',
              padding: '4px 8px',
            }}
          >
            {displayValue}
          </div>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <DateTimePicker value={dateValueString} onChange={handleChange} clearable />
        </Popover.Dropdown>
      </Popover>
    );
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withArrow disabled={disabled}>
      <Popover.Target>
        <div
          onClick={handleClick}
          style={{
            minWidth: 120,
            outline: 'none',
            cursor: disabled ? 'default' : 'pointer',
            padding: '4px 8px',
          }}
        >
          {displayValue}
        </div>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <DatePicker value={dateValueString} onChange={handleChange} />
      </Popover.Dropdown>
    </Popover>
  );
}
