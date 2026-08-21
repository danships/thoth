import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// THOTH-066: the per-user notification inbox. Exercises rendering of seeded inbox items, the
// header bell popover, per-item mark-read, and the `/notifications/{id}/open` navigation route
// (which re-checks access, marks the item read, and 303-redirects to the target page). The async
// dispatch pipeline (job-driven creation + own-change suppression) is covered by unit tests in
// `apps/jobs`; these specs verify the human-facing UI against seeded fixture data.
test.describe('notification inbox', () => {
  test('renders the seeded notifications on the global inbox', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText(SEED.notifications.unread.title, { exact: true })).toBeVisible();
    await expect(page.getByText(SEED.notifications.read.title, { exact: true })).toBeVisible();
  });

  test('marks a notification as read from the inbox', async ({ page, request }) => {
    // Ensure a known starting state (unread) so the assertion is deterministic across re-runs.
    const reset = await request.patch(`/api/v1/notifications/${SEED.notifications.unread.id}`, {
      data: { read: false },
    });
    expect(reset.ok()).toBeTruthy();

    await page.goto('/notifications');
    await expect(page.getByText(SEED.notifications.unread.title, { exact: true })).toBeVisible();

    const markRead = page.getByRole('button', { name: 'Mark read' });
    await expect(markRead).toBeVisible();
    await markRead.click();

    // Once the sole unread item is marked read there is no "Mark read" button left.
    await expect(page.getByRole('button', { name: 'Mark read' })).toHaveCount(0, { timeout: 6000 });
  });

  test('shows unread items in the header bell popover', async ({ page, request }) => {
    const reset = await request.patch(`/api/v1/notifications/${SEED.notifications.unread.id}`, {
      data: { read: false },
    });
    expect(reset.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(page.getByRole('button', { name: 'Search pages' })).toBeVisible();
    await expect(bell).toBeVisible();
    await bell.click();

    const title = page.getByText(SEED.notifications.unread.title, { exact: true });
    await expect(title).toBeVisible();

    const notification = await request.get('/api/v1/notifications');
    expect(notification.ok()).toBeTruthy();
    const notificationBody = (await notification.json()) as {
      data: { notifications: { id: string; occurredAt: string }[] };
    };
    const unread = notificationBody.data.notifications.find((item) => item.id === SEED.notifications.unread.id);
    expect(unread).toBeDefined();

    const timestamp = title.locator('xpath=ancestor::a').locator('time[datetime]');
    await expect(timestamp).toHaveAttribute('datetime', unread?.occurredAt ?? '');
    expect(Date.parse(unread?.occurredAt ?? '')).not.toBeNaN();
    await expect(timestamp).toHaveText(
      /^(just now|[1-9]\d* (minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years) ago)$/
    );
  });

  test('the open route redirects to the target page and marks the item read', async ({ page, request }) => {
    const reset = await request.patch(`/api/v1/notifications/${SEED.notifications.unread.id}`, {
      data: { read: false },
    });
    expect(reset.ok()).toBeTruthy();

    await page.goto(`/notifications/${SEED.notifications.unread.id}/open`);

    const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
    await expect(page).toHaveURL(`${baseUrl}/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`, { timeout: 10_000 });

    // The item should now be read.
    const listResponse = await request.get('/api/v1/notifications?unreadOnly=true');
    expect(listResponse.ok()).toBeTruthy();
    const body = (await listResponse.json()) as { data: { notifications: { id: string }[] } };
    expect(body.data.notifications.some((notification) => notification.id === SEED.notifications.unread.id)).toBe(
      false
    );
  });
});
