import { test, expect } from '../fixtures/test';

// THOTH-071 API surface: user timezone, notification settings/mute JSON endpoints.
// These specs deliberately avoid Notification/PushManager browser APIs (permission prompts
// aren't reliably scriptable across Playwright/Chromium/CI combos); the corresponding
// service-worker/push-client behaviour is covered by the jobs-side unit tests instead.
test.describe('THOTH-071 user + notification settings', () => {
  test('user timezone round-trips', async ({ request }) => {
    const before = await request.get('/api/v1/user/settings');
    expect(before.ok()).toBeTruthy();
    const beforeBody = await before.json(); const previous = beforeBody.data.timezone as string;

    const patch = await request.patch('/api/v1/user/settings', {
      data: { timezone: 'Europe/Amsterdam' },
    });
    expect(patch.ok()).toBeTruthy();
    const patchBody = await patch.json(); expect(patchBody.data.timezone).toBe('Europe/Amsterdam');

    // Invalid IANA is rejected.
    const bad = await request.patch('/api/v1/user/settings', { data: { timezone: 'Not/A_Zone' } });
    expect(bad.status()).toBe(400);

    // Restore.
    await request.patch('/api/v1/user/settings', { data: { timezone: previous } });
  });

  test('notification settings PATCH updates only quietSchedule', async ({ request }) => {
    const before = await request.get('/api/v1/notifications/settings');
    expect(before.ok()).toBeTruthy();
    const beforeBody = await before.json();
    const previousQuietSchedule = beforeBody.data.quietSchedule;

    try {
      const patch = await request.patch('/api/v1/notifications/settings', {
        data: {
          quietSchedule: {
            enabled: true,
            windows: [{ day: 5, startMinutes: 22 * 60, endMinutes: 2 * 60 }],
          },
        },
      });
      expect(patch.ok()).toBeTruthy();
      const body = await patch.json();
      expect(body.data.quietSchedule.enabled).toBe(true);
      expect(body.data.quietSchedule.windows).toHaveLength(1);
      // Timezone field is present but NOT settable via this endpoint.
      expect(typeof body.data.timezone).toBe('string');

      // Reject unknown top-level fields via strict schema.
      const withExtras = await request.patch('/api/v1/notifications/settings', {
        data: {
          quietSchedule: { enabled: false, windows: [] },
          timezone: 'UTC',
        },
      });
      expect(withExtras.status()).toBe(400);
    } finally {
      // Restore whatever quiet schedule existed before this test ran.
      await request.patch('/api/v1/notifications/settings', {
        data: { quietSchedule: previousQuietSchedule },
      });
    }
  });

  test('mute preset then unmute', async ({ request }) => {
    const mute = await request.post('/api/v1/notifications/mute', { data: { preset: '1h' } });
    expect(mute.ok()).toBeTruthy();
    const muteBody = await mute.json(); const muted = muteBody.data;
    expect(muted.isMutedNow).toBe(true);
    expect(muted.muteReason).toBe('temporary_mute');
    expect(typeof muted.mutedUntil).toBe('string');

    const past = await request.post('/api/v1/notifications/mute', {
      data: { until: '2000-01-01T00:00:00Z' },
    });
    expect(past.status()).toBe(400);

    const clear = await request.delete('/api/v1/notifications/mute');
    expect(clear.ok()).toBeTruthy();
    const clearBody = await clear.json(); const cleared = clearBody.data;
    expect(cleared.isMutedNow).toBe(false);
    expect(cleared.mutedUntil).toBeNull();
  });

  test('push-config returns disabled/null when Web Push is off', async ({ request }) => {
    const response = await request.get('/api/v1/notifications/push-config');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(typeof body.data.enabled).toBe('boolean');
    // publicKey is either null (disabled) or a non-empty string. We don't assert which because
    // WEB_PUSH_ENABLED may be set in some deployments' `.env.test` — but if enabled, a usable
    // config MUST include a public key (the browser card treats `publicKey: null` while
    // `enabled: true` as disabled, so that combination would mean a broken server config).
    if (body.data.enabled) {
      expect(typeof body.data.publicKey).toBe('string');
      expect(body.data.publicKey.length).toBeGreaterThan(0);
    } else {
      expect(body.data.publicKey).toBeNull();
    }
  });
});
