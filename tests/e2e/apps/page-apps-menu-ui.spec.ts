import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers THOTH-026 feedback item 3: a page's connected/connectable Apps are managed from a
// small "Apps" menu (three-dot icon) on the page detail screen itself, not from the App
// settings form.
test.describe('page detail Apps menu', () => {
  test('can connect a containers-scoped App to a page from the Apps menu, then disconnect it', async ({
    page,
    request,
  }) => {
    const label = `E2E Page Apps Menu ${Date.now()}`;

    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label,
        permission: 'read',
        scopeType: 'containers',
        attributionMode: 'creator',
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Apps for this page' }).click();
    await expect(page.getByText('Connect an app')).toBeVisible();

    const connectItem = page.getByRole('menuitem', { name: new RegExp(label) });
    await expect(connectItem).toBeVisible();
    await connectItem.click();

    // After connecting, the App moves from "connect" to "connected" and gains a disconnect
    // action. Connected rows are plain (non-`menuitem`) rows since they hold a nested button.
    await expect(page.getByRole('button', { name: `Disconnect ${label}` })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: `Disconnect ${label}` }).click();

    await expect(page.getByText('Connect an app')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: new RegExp(label) })).toBeVisible();
  });
});
