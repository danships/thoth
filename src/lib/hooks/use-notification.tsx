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

  return {
    showError,
    showSuccess,
    showWarning,
    showInfo,
  };
}
