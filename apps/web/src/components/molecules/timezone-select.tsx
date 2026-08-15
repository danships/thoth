'use client';

import { useMemo } from 'react';
import { Select } from '@mantine/core';
import { listIanaTimezones } from '@/lib/timezones';

type TimezoneSelectProperties = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
};

// Searchable IANA timezone picker shared by the notification-settings screen's own timezone
// field and (read-only, via `disabled`) its quiet-schedule editor context (THOTH-072).
export function TimezoneSelect({
  value,
  onChange,
  disabled = false,
  label = 'Timezone',
  description,
}: TimezoneSelectProperties) {
  const data = useMemo(() => listIanaTimezones(), []);

  return (
    <Select
      label={label}
      description={description}
      searchable
      data={data}
      value={value}
      disabled={disabled}
      nothingFoundMessage="No matching timezone"
      onChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
    />
  );
}
