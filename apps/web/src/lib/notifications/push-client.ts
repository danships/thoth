import { api } from '@/lib/api/client';

/**
 * Client helpers for Web Push registration (THOTH-071).
 *
 * These helpers NEVER auto-trigger the browser permission prompt. Every call site must be a
 * direct response to a user click on "Enable browser notifications" inside the inbox UI. The
 * feature-detection helpers are safe to call unconditionally.
 */

const SERVICE_WORKER_URL = '/notification-service-worker.js';

export type PushClientState =
  | { supported: false; reason: 'no-service-worker' | 'no-push-manager' | 'insecure-context' | 'unknown' }
  | {
      supported: true;
      permission: NotificationPermission;
      enabled: boolean;
      config: { enabled: boolean; publicKey: string | null };
    };

export function detectPushSupport(): PushClientState['supported'] extends true
  ? never
  : PushClientState | { supported: true } {
  if (globalThis.window === undefined) return { supported: false, reason: 'unknown' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-service-worker' };
  if (!('PushManager' in globalThis)) return { supported: false, reason: 'no-push-manager' };
  if (!globalThis.isSecureContext) return { supported: false, reason: 'insecure-context' };
  return { supported: true } as { supported: true };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) view[index] = raw.codePointAt(index) ?? 0;
  return buffer;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SERVICE_WORKER_URL);
}

/**
 * Request permission (if not already granted), subscribe to Push, and register the
 * resulting subscription server-side. MUST only be called from a user-initiated click handler
 * — never on load — per the THOTH-071 UX rule.
 */
export async function enableBrowserPush(): Promise<{ id: string } | { skipped: string }> {
  const support = detectPushSupport();
  if (!support.supported) return { skipped: `unsupported:${support.reason}` };

  const configResponse = await api.notifications.getPushConfig();
  const config = configResponse.data.data;
  if (!config.enabled || !config.publicKey) return { skipped: 'push-disabled' };

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { skipped: `permission:${permission}` };

  const registration = await ensureRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    }));
  const json = subscription.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];
  if (!json.endpoint || !p256dh || !auth) {
    return { skipped: 'malformed-subscription' };
  }
  const response = await api.notifications.registerPushSubscription({
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
    userAgentLabel: typeof navigator === 'undefined' ? undefined : navigator.userAgent.slice(0, 100),
  });
  return { id: response.data.data.id };
}

/** Best-effort unsubscribe. Never throws so a logout/disable action isn't blocked. */
export async function disableBrowserPush(): Promise<void> {
  const support = detectPushSupport();
  if (!support.supported) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe().catch(() => undefined);
    }
  } catch {
    // best-effort
  }
}
