import { test, expect } from '../fixtures/test';

// Covers the `/workspaces` index page added in response to THOTH-027 review feedback: it lists
// the user's active workspaces and, in a "Recently deleted" section, any soft-deleted
// workspaces still inside their grace period, each with a Restore action. Restoring brings the
// workspace back and navigates into it.
test.describe('workspaces index page', () => {
  test('lists active workspaces and a link to create a new one', async ({ page, request }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: `E2E Index Active ${Date.now()}` },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const created = createBody.data as { slug: string; name: string };

    await page.goto('/workspaces');

    await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New workspace' })).toBeVisible();
    await expect(page.getByRole('link', { name: created.name })).toBeVisible();
  });

  test('shows a soft-deleted workspace under "Recently deleted" and can restore it', async ({ page, request }) => {
    const uniqueName = `E2E Restore Me ${Date.now()}`;
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: uniqueName },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const created = createBody.data as { id: string; slug: string; name: string };

    const deleteResponse = await request.delete(`/api/v1/workspaces/${created.id}`);
    expect(deleteResponse.status()).toBe(204);

    await page.goto('/workspaces');

    await expect(page.getByRole('heading', { name: 'Recently deleted' })).toBeVisible();
    await expect(page.getByText(uniqueName)).toBeVisible();

    // Scope the Restore click to this workspace's row (a Group containing both the unique name
    // and a Restore button), so other soft-deleted workspaces left by earlier specs don't match.
    const row = page
      .locator('div')
      .filter({ has: page.getByText(uniqueName, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Restore' }) })
      .last();
    await row.getByRole('button', { name: 'Restore' }).click();

    // Restoring navigates into the restored workspace.
    await expect(page).toHaveURL(`/${created.slug}/pages`, { timeout: 15_000 });

    // It is now active again and no longer listed as deleted.
    const listResponse = await request.get('/api/v1/workspaces');
    const listBody = await listResponse.json();
    const active = listBody.data as { id: string }[];
    expect(active.some((workspace) => workspace.id === created.id)).toBeTruthy();
  });
});
