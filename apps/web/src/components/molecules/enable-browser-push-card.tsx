'use client';

import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useNotification } from '@/lib/hooks/use-notification';
import { detectPushSupport, disableBrowserPush, enableBrowserPush } from '@/lib/notifications/push-client';

/**
 * A small in-inbox card offering to enable browser Web Push (THOTH-071).
 *
 * The browser permission prompt is **only** ever triggered from the `onClick` of the button
 * below — never on load / on login / from a `useEffect`. This is the sole permission-request
 * call site in the app.
 */
export function EnableBrowserPushCard() {
  const { showError, showSuccess } = useNotification();
  const [state, setState] = useState<
    | { status: 'checking' }
    | { status: 'unsupported'; reason: string }
    | { status: 'disabled' }
    | { status: 'ready'; permission: NotificationPermission }
    | { status: 'enabled' }
  >({ status: 'checking' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const support = detectPushSupport();
      if (!('supported' in support) || support.supported !== true) {
        if (!cancelled)
          setState({ status: 'unsupported', reason: (support as { reason?: string }).reason ?? 'unknown' });
        return;
      }
      try {
        const clientModule = await import('@/lib/api/client');
        const configResponse = await clientModule.api.notifications.getPushConfig();
        const config = configResponse.data.data;
        if (!config.enabled || !config.publicKey) {
          if (!cancelled) setState({ status: 'disabled' });
          return;
        }
        const permission = typeof Notification === 'undefined' ? 'default' : Notification.permission;
        // Detect if we already have an active subscription for this browser.
        const registration =
          typeof navigator !== 'undefined' && 'serviceWorker' in navigator
            ? await navigator.serviceWorker.getRegistration('/notification-service-worker.js')
            : null;
        const existingSubscription = registration ? await registration.pushManager.getSubscription() : null;
        if (existingSubscription && permission === 'granted') {
          if (!cancelled) setState({ status: 'enabled' });
        } else if (!cancelled) {
          setState({ status: 'ready', permission });
        }
      } catch {
        if (!cancelled) setState({ status: 'disabled' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'checking' || state.status === 'disabled') return null;
  if (state.status === 'unsupported') {
    return (
      <Alert color="gray" variant="light">
        Browser notifications aren&apos;t available in this browser.
      </Alert>
    );
  }
  if (state.status === 'enabled') {
    return (
      <Alert color="green" variant="light">
        <Group justify="space-between" align="center">
          <Text size="sm">Browser notifications are enabled on this device.</Text>
          <Button
            variant="subtle"
            size="xs"
            loading={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                await disableBrowserPush();
                setBusy(false);
                setState({ status: 'ready', permission: 'granted' });
                showSuccess('Browser notifications disabled on this device');
              })();
            }}
          >
            Disable on this device
          </Button>
        </Group>
      </Alert>
    );
  }
  return (
    <Alert color="blue" variant="light">
      <Stack gap="xs">
        <Text size="sm">
          Enable browser notifications to receive alerts on this device when someone updates a page you follow.
        </Text>
        <Group>
          <Button
            size="xs"
            loading={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const result = await enableBrowserPush();
                setBusy(false);
                if ('id' in result) {
                  setState({ status: 'enabled' });
                  showSuccess('Browser notifications enabled on this device');
                } else {
                  showError(`Could not enable notifications (${result.skipped})`);
                }
              })();
            }}
          >
            Enable browser notifications
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
