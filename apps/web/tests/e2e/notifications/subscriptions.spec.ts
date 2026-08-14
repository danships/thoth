import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

type SubscriptionsResponse = {
  data: { subscriptions: { id: string; containerId: string | null; kind: string }[] };
};

// THOTH-066: per-user subscription rules. Covers the workspace-level toggle in Workspace
// Settings and setting a page-level rule (both via the page menu UI and directly against the
// API), asserting the canonical rules reflect each change. Rules are per-user state scoped by
// `userId`, so these mutations only affect the seeded e2e user.
test.describe('notification subscriptions', () => {
  test.afterEach(async ({ request }) => {
    // Reset the page rule so re-runs and other specs start from a clean slate.
    const pageCleanup = await request.put(`/api/v1/notifications/subscriptions/pages/${SEED.pages.root.id}`, {
      data: { kind: 'none' },
    });
    expect(pageCleanup.ok()).toBeTruthy();

    // Restore the seeded workspace-level subscription.
    const workspaceCleanup = await request.put(`/api/v1/notifications/subscriptions/workspaces/${SEED.workspace.id}`, {
      data: { kind: 'workspace' },
    });
    expect(workspaceCleanup.ok()).toBeTruthy();
  });

  test('toggles the workspace subscription from Workspace Settings', async ({ page, request }) => {
    await page.goto(`/${SEED.workspace.slug}/settings`);

    const toggle = page.getByLabel('Notify me about all page changes in this workspace');
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeChecked();

    await toggle.click();
    await expect(toggle).not.toBeChecked();

    // Verify the workspace rule was removed server-side.
    await expect
      .poll(async () => {
        const response = await request.get(`/api/v1/notifications/subscriptions?workspaceId=${SEED.workspace.id}`);
        const body = (await response.json()) as SubscriptionsResponse;
        return body.data.subscriptions.some((rule) => rule.containerId === null && rule.kind === 'workspace');
      })
      .toBe(false);

    await toggle.click();
    await expect(toggle).toBeChecked();

    await expect
      .poll(async () => {
        const response = await request.get(`/api/v1/notifications/subscriptions?workspaceId=${SEED.workspace.id}`);
        const body = (await response.json()) as SubscriptionsResponse;
        return body.data.subscriptions.some((rule) => rule.containerId === null && rule.kind === 'workspace');
      })
      .toBe(true);
  });

  test('sets a page rule from the page menu', async ({ page, request }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Page menu' }).click();
    await page.getByRole('menuitem', { name: 'Notifications' }).hover();
    await page.getByRole('menuitem', { name: 'Subscribe to this page', exact: true }).click();

    await expect
      .poll(async () => {
        const response = await request.get(`/api/v1/notifications/subscriptions?workspaceId=${SEED.workspace.id}`);
        const body = (await response.json()) as SubscriptionsResponse;
        return body.data.subscriptions.some((rule) => rule.containerId === SEED.pages.root.id && rule.kind === 'page');
      })
      .toBe(true);
  });

  test('sets and clears a page rule via the API', async ({ request }) => {
    const setResponse = await request.put(`/api/v1/notifications/subscriptions/pages/${SEED.pages.root.id}`, {
      data: { kind: 'tree' },
    });
    expect(setResponse.ok()).toBeTruthy();
    const setBody = (await setResponse.json()) as SubscriptionsResponse;
    expect(
      setBody.data.subscriptions.some((rule) => rule.containerId === SEED.pages.root.id && rule.kind === 'tree')
    ).toBe(true);

    const clearResponse = await request.put(`/api/v1/notifications/subscriptions/pages/${SEED.pages.root.id}`, {
      data: { kind: 'none' },
    });
    expect(clearResponse.ok()).toBeTruthy();
    const clearBody = (await clearResponse.json()) as SubscriptionsResponse;
    expect(clearBody.data.subscriptions.some((rule) => rule.containerId === SEED.pages.root.id)).toBe(false);
  });
});
