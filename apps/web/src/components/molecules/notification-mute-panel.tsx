'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import type { NotificationMuteResponse, PostNotificationMuteBody } from '@/types/api';

const PRESETS: { value: '1h' | '2h' | '1d'; label: string }[] = [
  { value: '1h', label: '+1 hour' },
  { value: '2h', label: '+2 hours' },
  { value: '1d', label: '+1 day' },
];

type NotificationMutePanelProperties = {
  mutedUntil: string | null;
  isMutedNow: boolean;
  muteReason: 'temporary_mute' | 'quiet_schedule' | null;
  onChange: (next: NotificationMuteResponse) => void;
};

// Quick temporary-mute controls (THOTH-072, the GUI THOTH-071 deferred): +1h/+2h/+1d presets, a
// custom "mute until" datetime, and Unmute. All backed by `POST`/`DELETE /notifications/mute`.
export function NotificationMutePanel({
  mutedUntil,
  isMutedNow,
  muteReason,
  onChange,
}: NotificationMutePanelProperties) {
  const { showError, showSuccess } = useNotification();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [customUntil, setCustomUntil] = useState('');

  const runMute = async (body: PostNotificationMuteBody, busyKey: string) => {
    setBusyAction(busyKey);
    try {
      const response = await api.notifications.mute(body);
      onChange(response.data.data);
      showSuccess('Notifications muted');
    } catch {
      showError('Failed to mute notifications');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnmute = async () => {
    setBusyAction('unmute');
    try {
      const response = await api.notifications.unmute();
      onChange(response.data.data);
      showSuccess('Notifications unmuted');
    } catch {
      showError('Failed to unmute notifications');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCustomUntil = async () => {
    if (!customUntil) {
      return;
    }
    const iso = new Date(customUntil).toISOString();
    await runMute({ until: iso }, 'custom');
  };

  return (
    <Stack gap="sm">
      {isMutedNow ? (
        <Alert color="yellow" variant="light">
          <Group justify="space-between" align="center">
            <Text size="sm">
              {muteReason === 'temporary_mute' && mutedUntil
                ? `Muted until ${new Date(mutedUntil).toLocaleString()}`
                : 'Currently within a quiet-schedule window'}
              {muteReason === 'quiet_schedule' && <Badge ml="xs">Quiet schedule</Badge>}
            </Text>
            {muteReason === 'temporary_mute' && (
              <Button
                size="xs"
                variant="subtle"
                loading={busyAction === 'unmute'}
                disabled={busyAction !== null && busyAction !== 'unmute'}
                onClick={() => void handleUnmute()}
              >
                Unmute
              </Button>
            )}
          </Group>
        </Alert>
      ) : (
        <Text size="sm" c="dimmed">
          Not currently muted.
        </Text>
      )}

      <Group>
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            size="xs"
            variant="light"
            loading={busyAction === preset.value}
            disabled={busyAction !== null && busyAction !== preset.value}
            onClick={() => void runMute({ preset: preset.value }, preset.value)}
          >
            {preset.label}
          </Button>
        ))}
      </Group>

      <Group align="flex-end">
        <TextInput
          label="Mute until"
          type="datetime-local"
          value={customUntil}
          onChange={(event) => setCustomUntil(event.currentTarget.value)}
          w={220}
        />
        <Button
          size="xs"
          variant="default"
          disabled={!customUntil || (busyAction !== null && busyAction !== 'custom')}
          loading={busyAction === 'custom'}
          onClick={() => void handleCustomUntil()}
        >
          Mute until this time
        </Button>
      </Group>
    </Stack>
  );
}
