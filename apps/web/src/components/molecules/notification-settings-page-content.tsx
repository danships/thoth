'use client';

import { useState } from 'react';
import { Alert, Button, Divider, Group, Paper, Stack, Title } from '@mantine/core';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { useUserSettings } from '@/lib/hooks/api/use-user-settings';
import { useNotificationSettings } from '@/lib/hooks/api/use-notification-settings';
import { TimezoneSelect } from '@/components/molecules/timezone-select';
import { QuietScheduleEditor } from '@/components/molecules/quiet-schedule-editor';
import { NotificationMutePanel } from '@/components/molecules/notification-mute-panel';
import { detectBrowserTimezone } from '@/lib/timezones';
import type { QuietSchedule } from '@thoth/database/notifications/mute';

const DEFAULT_QUIET_SCHEDULE: QuietSchedule = { enabled: false, windows: [] };

// Cross-workspace notification-settings screen (THOTH-072): the weekly quiet-window editor and
// IANA timezone picker deferred from THOTH-071. All server-side plumbing already existed
// (`GET/PATCH /notifications/settings`, `GET/PATCH /user/settings`,
// `POST/DELETE /notifications/mute`) — this composes Mantine controls on top of it.
export function NotificationSettingsPageContent() {
  const { showError, showSuccess } = useNotification();
  const { data: userSettings, mutate: mutateUserSettings, isLoading: userSettingsLoading } = useUserSettings();
  const {
    data: notificationSettings,
    mutate: mutateNotificationSettings,
    isLoading: notificationSettingsLoading,
  } = useNotificationSettings();

  // Local edits are tracked as an "override" of the server value, rather than seeded via a
  // `useEffect`+`setState` (which would cascade an extra render every time the SWR data
  // resolves). While `override` is `null`, the displayed value is derived straight from the
  // fetched data during render; it's only set once the user actually edits a control, and reset
  // back to `null` after a successful save so the next fetch is trusted again.
  const [timezoneOverride, setTimezoneOverride] = useState<string | null>(null);
  const [scheduleOverride, setScheduleOverride] = useState<QuietSchedule | null>(null);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const serverTimezone = userSettings?.timezone ?? null;
  const timezone = timezoneOverride ?? serverTimezone ?? detectBrowserTimezone() ?? 'UTC';
  const quietSchedule = scheduleOverride ?? notificationSettings?.quietSchedule ?? DEFAULT_QUIET_SCHEDULE;

  const timezoneDirty = serverTimezone !== null && timezone !== serverTimezone;
  const scheduleDirty =
    notificationSettings !== undefined &&
    JSON.stringify(quietSchedule) !== JSON.stringify(notificationSettings.quietSchedule);

  const handleSaveTimezone = async () => {
    setSavingTimezone(true);
    try {
      await api.user.patchSettings({ timezone });
      setTimezoneOverride(null);
      await Promise.all([mutateUserSettings(), mutateNotificationSettings()]);
      showSuccess('Timezone updated');
    } catch {
      showError('Failed to update timezone');
    } finally {
      setSavingTimezone(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const response = await api.notifications.patchSettings({ quietSchedule });
      setScheduleOverride(null);
      await mutateNotificationSettings((previous) =>
        previous ? { ...previous, quietSchedule: response.data.data.quietSchedule } : previous
      );
      showSuccess('Quiet schedule saved');
    } catch {
      showError('Failed to save quiet schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <Stack gap="xl" maw={720}>
      <Title order={2}>Notification settings</Title>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Title order={4}>Timezone</Title>
          <Divider />
          <Alert color="gray" variant="light">
            Your timezone is used to evaluate the quiet schedule below in local wall-clock time. It applies across every
            workspace.
          </Alert>
          <TimezoneSelect value={timezone} onChange={setTimezoneOverride} disabled={userSettingsLoading} />
          <Group justify="flex-end">
            <Button loading={savingTimezone} disabled={!timezoneDirty} onClick={() => void handleSaveTimezone()}>
              Save timezone
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Title order={4}>Quiet schedule</Title>
          <Divider />
          <QuietScheduleEditor
            value={quietSchedule}
            onChange={setScheduleOverride}
            disabled={notificationSettingsLoading}
          />
          <Group justify="flex-end">
            <Button loading={savingSchedule} disabled={!scheduleDirty} onClick={() => void handleSaveSchedule()}>
              Save quiet schedule
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">
          <Title order={4}>Mute</Title>
          <Divider />
          {notificationSettings && (
            <NotificationMutePanel
              mutedUntil={notificationSettings.mutedUntil}
              isMutedNow={notificationSettings.isMutedNow}
              muteReason={notificationSettings.muteReason}
              onChange={(next) => {
                void mutateNotificationSettings((previous) => (previous ? { ...previous, ...next } : previous), {
                  revalidate: false,
                });
              }}
            />
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
