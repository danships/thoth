import { Notification as MantineNotification } from '@mantine/core';
import { IconCheck, IconInfoCircle, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { useEffect } from 'react';

export type NotificationType = 'error' | 'success' | 'warning' | 'info';

type NotificationProperties = {
  message: string;
  type: NotificationType;
  onClose: () => void;
  autoClose?: number | false;
};

export function Notification({ message, type, onClose, autoClose = 5000 }: NotificationProperties) {
  useEffect(() => {
    if (autoClose && autoClose > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoClose);

      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [autoClose, onClose]);

  const getIcon = (): React.ReactNode => {
    switch (type) {
      case 'error': {
        return <IconX size={20} />;
      }
      case 'success': {
        return <IconCheck size={20} />;
      }
      case 'warning': {
        return <IconAlertTriangle size={20} />;
      }
      case 'info': {
        return <IconInfoCircle size={20} />;
      }
      default: {
        return null;
      }
    }
  };

  const getColor = (): string => {
    switch (type) {
      case 'error': {
        return 'red';
      }
      case 'success': {
        return 'teal';
      }
      case 'warning': {
        return 'yellow';
      }
      case 'info': {
        return 'blue';
      }
      default: {
        return 'gray';
      }
    }
  };

  return (
    <MantineNotification
      icon={getIcon()}
      color={getColor()}
      onClose={onClose}
      closeButtonProps={{ 'aria-label': 'Close notification' }}
    >
      {message}
    </MantineNotification>
  );
}
