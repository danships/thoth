import { describe, expect, test } from 'vitest';
import { getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

describe('notification open route', () => {
  test('redirects to the configured public URL and marks the notification read', async () => {
    const baseUrl = getBaseUrl();
    const owner = await getOwnerClient(baseUrl);

    const resetResponse = await owner.patch(`/api/v1/notifications/${SEED.notifications.unread.id}`, { read: false });
    expect(resetResponse.ok).toBe(true);

    const response = await owner.fetch(`/notifications/${SEED.notifications.unread.id}/open`, {
      headers: { Host: '0.0.0.0:3000' },
      redirect: 'manual',
    });
    const expectedLocation = `${baseUrl}/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`;

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(expectedLocation);
    expect(new URL(response.headers.get('location')!).origin).not.toBe('http://0.0.0.0:3000');

    const unreadResponse = await owner.get('/api/v1/notifications', { params: { unreadOnly: 'true' } });
    expect(unreadResponse.ok).toBe(true);
    const unreadNotifications = await getData<{ notifications: { id: string }[] }>(unreadResponse);
    expect(
      unreadNotifications.notifications.some((notification) => notification.id === SEED.notifications.unread.id)
    ).toBe(false);
  });
});
