import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// THOTH-045: workspace owners can no longer edit the storage quota — it is managed by platform
// administrators. The settings page now only shows usage (and a "platform-managed" note).
test('owner sees storage usage but no quota-edit controls on workspace settings', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/settings`);

  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
  // The old owner-editable quota controls are gone.
  await expect(page.getByLabel('Storage quota in bytes')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save quota' })).toHaveCount(0);
  // Owners are told limits are platform-managed.
  await expect(page.getByText('Storage limits are managed by your platform administrator.')).toBeVisible();
});

// The workspace update endpoint no longer accepts `storageQuotaBytes` — submitting it is a 400.
test('PATCH /api/v1/workspaces rejects a storageQuotaBytes field', async ({ request }) => {
  const response = await request.patch(`/api/v1/workspaces/${SEED.workspace.id}`, {
    data: { storageQuotaBytes: 2_097_152 },
  });
  expect(response.status()).toBe(400);
});

test('uploading past the platform-managed workspace quota surfaces a storage-limit error', async ({ page }) => {
  // The seeded e2e user is the platform administrator, so it can set the workspace quota via the
  // admin API. Set a tight 1 MB limit for this workspace.
  const setQuota = await page.request.patch(`/api/v1/admin/workspaces/${SEED.workspace.id}`, {
    data: { storageQuotaBytes: 1_048_576 },
  });
  expect(setQuota.ok()).toBeTruthy();

  try {
    const oversizedForQuota = Buffer.alloc(1_100_000, 'b');
    const response = await page.request.post('/api/v1/files', {
      multipart: {
        file: {
          name: 'exceeds-quota.bin',
          mimeType: 'application/octet-stream',
          buffer: oversizedForQuota,
        },
      },
    });
    expect(response.status()).toBe(409);
  } finally {
    // Clear the limit again so other specs' uploads aren't affected by execution order.
    await page.request.patch(`/api/v1/admin/workspaces/${SEED.workspace.id}`, {
      data: { storageQuotaBytes: null },
    });
  }
});
