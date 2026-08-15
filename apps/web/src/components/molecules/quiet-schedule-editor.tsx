'use client';

import { ActionIcon, Button, Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { z } from 'zod';
import type { QuietSchedule, QuietScheduleWindow } from '@thoth/database/notifications/mute';

const DAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const DEFAULT_WINDOW: QuietScheduleWindow = { day: 1, startMinutes: 22 * 60, endMinutes: 7 * 60 };

// `startMinutes`/`endMinutes` are minutes-since-local-midnight (see
// `packages/database/src/notifications/mute.ts`); `<input type="time">` speaks `HH:mm`, so
// convert at the edges rather than pulling in a date-picker dependency for two plain fields.
function minutesToTimeValue(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Validates & transforms an `<input type="time">` value ("HH:mm") into minutes-since-midnight.
const timeValueSchema = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/)
  .transform((value) => {
    const [hoursString, minsString] = value.split(':');
    return { hours: Number.parseInt(hoursString!, 10), mins: Number.parseInt(minsString!, 10) };
  })
  .refine(({ hours, mins }) => hours <= 23 && mins <= 59)
  .transform(({ hours, mins }) => hours * 60 + mins);

function timeValueToMinutes(value: string): number | null {
  const result = timeValueSchema.safeParse(value);
  return result.success ? result.data : null;
}

type QuietScheduleEditorProperties = {
  value: QuietSchedule;
  onChange: (next: QuietSchedule) => void;
  disabled?: boolean;
};

// The weekly quiet-window editor deferred from THOTH-071 (see that PR's follow-up note): day +
// start/end time per window, any number of windows, plus the schedule's own enabled toggle. A
// window whose `endMinutes <= startMinutes` wraps past local midnight (documented inline below
// and in the evaluator) — this editor doesn't need to special-case that, it's just two numbers.
export function QuietScheduleEditor({ value, onChange, disabled = false }: QuietScheduleEditorProperties) {
  const updateWindow = (index: number, patch: Partial<QuietScheduleWindow>) => {
    const windows = value.windows.map((window, index_) => (index_ === index ? { ...window, ...patch } : window));
    onChange({ ...value, windows });
  };

  const removeWindow = (index: number) => {
    onChange({ ...value, windows: value.windows.filter((_, index_) => index_ !== index) });
  };

  const addWindow = () => {
    onChange({ ...value, windows: [...value.windows, { ...DEFAULT_WINDOW }] });
  };

  return (
    <Stack gap="sm">
      <Switch
        label="Enable quiet schedule"
        description="Suppress browser push during these recurring windows. Inbox items are still created."
        checked={value.enabled}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
      />

      {value.windows.length === 0 && (
        <Text size="sm" c="dimmed">
          No quiet windows configured yet.
        </Text>
      )}

      <Stack gap="xs">
        {value.windows.map((window, index) => (
          <Group key={index} align="flex-end" wrap="wrap">
            <Select
              label={index === 0 ? 'Day' : undefined}
              aria-label={index === 0 ? undefined : `Day for quiet window ${index + 1}`}
              data={DAY_OPTIONS}
              value={String(window.day)}
              disabled={disabled}
              onChange={(next) => {
                if (next !== null) {
                  updateWindow(index, { day: Number.parseInt(next, 10) });
                }
              }}
              w={140}
            />
            <TextInput
              label={index === 0 ? 'From' : undefined}
              aria-label={index === 0 ? undefined : `From time for quiet window ${index + 1}`}
              type="time"
              value={minutesToTimeValue(window.startMinutes)}
              disabled={disabled}
              onChange={(event) => {
                const minutes = timeValueToMinutes(event.currentTarget.value);
                if (minutes !== null) {
                  updateWindow(index, { startMinutes: minutes });
                }
              }}
              w={110}
            />
            <TextInput
              label={index === 0 ? 'Until' : undefined}
              aria-label={index === 0 ? undefined : `Until time for quiet window ${index + 1}`}
              type="time"
              value={minutesToTimeValue(window.endMinutes)}
              disabled={disabled}
              onChange={(event) => {
                const minutes = timeValueToMinutes(event.currentTarget.value);
                if (minutes !== null) {
                  updateWindow(index, { endMinutes: minutes });
                }
              }}
              w={110}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Remove quiet window"
              disabled={disabled}
              onClick={() => removeWindow(index)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>

      <Group>
        <Button variant="light" size="xs" disabled={disabled || value.windows.length >= 50} onClick={addWindow}>
          Add quiet window
        </Button>
      </Group>

      <Text size="xs" c="dimmed">
        An &quot;Until&quot; time earlier than or equal to &quot;From&quot; wraps past midnight, e.g. Friday 22:00 until
        02:00 means Friday night through Saturday morning.
      </Text>
    </Stack>
  );
}

// Referenced by the settings page to build a brand-new blank window and to know whether the
// checkbox strategy is exhausted; exported for the page/tests, not just internal use.
export const QUIET_SCHEDULE_DAY_OPTIONS = DAY_OPTIONS;
