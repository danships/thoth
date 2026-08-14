import { api } from '@/lib/api/client';

/**
 * Client helpers for Web Push registration (THOTH-071).
 *
 * These helpers NEVER auto-trigger the browser permission prompt. Every call site must be a
 * direct response to a user click on "Enable browser notifications" inside the inbox UI. The
 * feature-detection helpers are safe to call unconditionally.
 */

const SERVICE_WORKER_URL = '/notification-service-worker.js';

// Local, per-browser association between the active `PushSubscription.endpoint` and the
// server-side `push-subscription` row id it was registered as. This is what lets
// `disableBrowserPush` delete the server record (not just unsubscribe locally) — without it we'd
// have no way to look the row id back up from the browser-side subscription alone.
const SUBSCRIPTION_RECORD_STORAGE_KEY = 'thoth:push-subscription-record';

type StoredSubscriptionRecord = { endpoint: string; id: string };

function readStoredSubscriptionRecord(): StoredSubscriptionRecord | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(SUBSCRIPTION_RECORD_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredSubscriptionRecord>;
    if (typeof parsed.endpoint === 'string' && typeof parsed.id === 'string') {
      return { endpoint: parsed.endpoint, id: parsed.id };
    }
  } catch {
    // Corrupt/inaccessible storage — treat as absent.
  }
  return undefined;
}

function writeStoredSubscriptionRecord(record: StoredSubscriptionRecord): void {
  try {
    globalThis.localStorage?.setItem(SUBSCRIPTION_RECORD_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Best-effort — a failure to persist just means disableBrowserPush later falls back to a
    // local-only unsubscribe.
  }
}

function clearStoredSubscriptionRecord(): void {
  try {
    globalThis.localStorage?.removeItem(SUBSCRIPTION_RECORD_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

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

async function registerSubscription(subscription: PushSubscription): Promise<{ id: string } | { skipped: string }> {
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
  const id = response.data.data.id;
  writeStoredSubscriptionRecord({ endpoint: json.endpoint, id });
  return { id };
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
  return registerSubscription(subscription);
}

/**
 * Re-associates an already-active browser subscription (permission already granted, e.g. from a
 * prior session) with its server-side `push-subscription` row, without prompting for permission
 * or creating a new subscription. Safe to call on every page load — `registerPushSubscription`
 * is an idempotent upsert keyed by `endpoint`. This is what lets `disableBrowserPush` find the
 * row id for a subscription that predates the current tab's `localStorage` record (e.g. cleared
 * storage, or enabled from a different tab).
 */
export async function syncBrowserPushRegistration(): Promise<{ id: string } | { skipped: string }> {
  const support = detectPushSupport();
  if (!support.supported) return { skipped: `unsupported:${support.reason}` };
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return { skipped: 'permission-not-granted' };
  }
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (!subscription) return { skipped: 'no-subscription' };
  return registerSubscription(subscription);
}

/**
 * Disable browser push on this device: deletes the server-side `push-subscription` row (so
 * `notification.deliver` stops targeting it immediately, rather than waiting for a future
 * delivery failure to disable it) and unsubscribes locally. Best-effort/non-throwing so a
 * logout/disable action is never blocked by a network failure.
 */
export async function disableBrowserPush(): Promise<void> {
  const support = detectPushSupport();
  if (!support.supported) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    const stored = readStoredSubscriptionRecord();
    const endpoint = subscription?.endpoint ?? stored?.endpoint;
    const subscriptionId = stored && stored.endpoint === endpoint ? stored.id : undefined;
    if (subscriptionId) {
      await api.notifications.deletePushSubscription(subscriptionId).catch(() => undefined);
    }
    if (subscription) {
      await subscription.unsubscribe().catch(() => undefined);
    }
    clearStoredSubscriptionRecord();
  } catch {
    // best-effort
  }
}
