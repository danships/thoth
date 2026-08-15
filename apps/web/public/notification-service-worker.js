/*
 * Thoth notification service worker (THOTH-071).
 *
 * Kept intentionally small — receives Web Push payloads and displays a browser notification,
 * plus routes click events to an in-app URL. Payloads are the small JSON produced by
 * `apps/jobs`' `notification.deliver` handler:
 *   { title, body, tag, notificationId, openPath }
 *
 * Security: the click handler builds the target URL via `new URL(openPath, self.location.origin)`
 * and ONLY accepts a relative path beginning with `/notifications/`. Any absolute/cross-origin
 * `openPath` is rejected — a compromised payload cannot open-redirect the user.
 */

self.addEventListener('push', (event) => {
  let payload = { title: 'Notification', body: '', tag: 'thoth-notification', notificationId: null, openPath: null };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...parsed };
      }
    }
  } catch (_error) {
    // Malformed payload — show a bare notification so the user isn't left in the dark.
  }
  const title = typeof payload.title === 'string' && payload.title.length > 0 ? payload.title : 'Notification';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    tag: typeof payload.tag === 'string' ? payload.tag : 'thoth-notification',
    data: { openPath: payload.openPath, notificationId: payload.notificationId },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

function isSafeOpenPath(openPath) {
  if (typeof openPath !== 'string') return false;
  if (!openPath.startsWith('/notifications/')) return false;
  try {
    const url = new URL(openPath, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith('/notifications/');
  } catch (_error) {
    return false;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawOpenPath = event.notification.data && event.notification.data.openPath;
  const openPath = isSafeOpenPath(rawOpenPath) ? rawOpenPath : '/notifications';
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(openPath, self.location.origin).toString();
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })()
  );
});
