import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconInfoCircle, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { useCallback } from 'react';

export function useNotification() {
  const showError = useCallback((message: string, title?: string) => {
    notifications.show({
      message,
      title,
      color: 'red',
      icon: <IconX size={18} />,
      autoClose: 5000,
    });
  }, []);

  const showSuccess = useCallback((message: string, title?: string) => {
    notifications.show({
      message,
      title,
      color: 'teal',
      icon: <IconCheck size={18} />,
      autoClose: 5000,
    });
  }, []);

  const showWarning = useCallback((message: string, title?: string) => {
    notifications.show({
      message,
      title,
      color: 'yellow',
      icon: <IconAlertTriangle size={18} />,
      autoClose: 5000,
    });
  }, []);

  const showInfo = useCallback((message: string, title?: string) => {
    notifications.show({
      message,
      title,
      color: 'blue',
      icon: <IconInfoCircle size={18} />,
      autoClose: 5000,
    });
  }, []);

  // A lightweight undo affordance (THOTH-074) — a plain `showInfo`/`showError`-style toast plus
  // an inline "Undo" button, closing itself once clicked. `message` accepts `React.ReactNode` in
  // Mantine's `NotificationData`, so no custom notification component is needed.
  const showUndo = useCallback((message: string, onUndo: () => void) => {
    const id = notifications.show({
      message: (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">{message}</Text>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              onUndo();
              notifications.hide(id);
            }}
          >
            Undo
          </Button>
        </Group>
      ),
      color: 'blue',
      icon: <IconInfoCircle size={18} />,
      autoClose: 6000,
    });
  }, []);

  return {
    showError,
    showSuccess,
    showWarning,
    showInfo,
    showUndo,
  };
}
