import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// THOTH-072: the weekly quiet-window editor / timezone-picker UI deferred from THOTH-071. These
// specs drive the actual Mantine controls (not just the underlying JSON API, already covered by
// `muting-and-settings.spec.ts`) end-to-end through the browser.
test.describe('THOTH-072 notification settings UI', () => {
  test('the workspace menu links to the notification-settings screen', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);
    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await page.getByRole('menuitem', { name: 'Notification settings' }).click();
    await expect(page).toHaveURL('/notifications/settings', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();
  });

  test('can change the timezone and it persists across a reload', async ({ page, request }) => {
    const before = await request.get('/api/v1/user/settings');
    const beforeBody = await before.json();
    const previousTimezone = beforeBody.data.timezone as string;

    try {
      await page.goto('/notifications/settings');
      await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();

      const timezoneSelect = page.getByRole('combobox', { name: 'Timezone', exact: true });
      await timezoneSelect.click();
      await timezoneSelect.fill('Europe/Amsterdam');
      await page.getByRole('option', { name: 'Europe/Amsterdam' }).click();

      await page.getByRole('button', { name: 'Save timezone' }).click();
      await expect(page.getByText('Timezone updated')).toBeVisible();

      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Timezone', exact: true })).toHaveValue('Europe/Amsterdam');
    } finally {
      await request.patch('/api/v1/user/settings', { data: { timezone: previousTimezone } });
    }
  });

  test('can add, edit, and remove a quiet-schedule window, then save it', async ({ page, request }) => {
    const before = await request.get('/api/v1/notifications/settings');
    const beforeBody = await before.json();
    const previousQuietSchedule = beforeBody.data.quietSchedule;

    try {
      await page.goto('/notifications/settings');
      await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();

      await page.getByRole('switch', { name: 'Enable quiet schedule' }).click();
      await page.getByRole('button', { name: 'Add quiet window' }).click();

      const dayField = page.getByRole('combobox', { name: 'Day' });
      await dayField.click();
      await page.getByRole('option', { name: 'Friday' }).click();

      const fromField = page.getByLabel('From', { exact: true });
      await fromField.fill('22:00');
      const untilField = page.getByLabel('Until', { exact: true });
      await untilField.fill('02:00');

      await page.getByRole('button', { name: 'Save quiet schedule' }).click();
      await expect(page.getByText('Quiet schedule saved')).toBeVisible();

      await page.reload();
      await expect(page.getByRole('switch', { name: 'Enable quiet schedule' })).toBeChecked();
      await expect(page.getByRole('combobox', { name: 'Day' })).toHaveValue('Friday');
      await expect(page.getByLabel('From', { exact: true })).toHaveValue('22:00');
      await expect(page.getByLabel('Until', { exact: true })).toHaveValue('02:00');

      // Remove the window and save again.
      await page.getByRole('button', { name: 'Remove quiet window' }).click();
      await page.getByRole('button', { name: 'Save quiet schedule' }).click();
      await expect(page.getByText('Quiet schedule saved')).toBeVisible();
      await page.reload();
      await expect(page.getByText('No quiet windows configured yet.')).toBeVisible();
    } finally {
      await request.patch('/api/v1/notifications/settings', { data: { quietSchedule: previousQuietSchedule } });
    }
  });

  test('mute presets and unmute work from the settings screen', async ({ page, request }) => {
    try {
      await page.goto('/notifications/settings');
      await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();

      await page.getByRole('button', { name: '+1 hour' }).click();
      await expect(page.getByText(/^Muted until /)).toBeVisible();

      await page.getByRole('button', { name: 'Unmute' }).click();
      await expect(page.getByText('Not currently muted.')).toBeVisible();
    } finally {
      await request.delete('/api/v1/notifications/mute');
    }
  });

  test('the notification inbox links to the settings screen', async ({ page }) => {
    await page.goto('/notifications');
    await page.getByRole('link', { name: 'Notification settings' }).click();
    await expect(page).toHaveURL('/notifications/settings', { timeout: 15_000 });
  });
});
