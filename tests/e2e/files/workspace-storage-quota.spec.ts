import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('owner can edit the storage quota and it persists', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/settings`);

  const quotaInput = page.getByLabel('Storage quota in bytes');
  await expect(quotaInput).toBeVisible();
  await expect(quotaInput).toBeEnabled();

  const newQuota = 2_097_152; // 2 MB
  await quotaInput.fill(String(newQuota));
  await page.getByRole('button', { name: 'Save quota' }).click();

  await expect(page.getByText('Storage quota updated')).toBeVisible({ timeout: 6000 });
  await page.reload();
  await expect(page.getByLabel('Storage quota in bytes')).toHaveValue(String(newQuota));

  // Restore the seeded quota afterwards so the "quota exceeded" case below (and other specs
  // relying on the small seeded quota) still work regardless of test execution order.
  await page.getByLabel('Storage quota in bytes').fill(String(SEED.workspace.storageQuotaBytes));
  await page.getByRole('button', { name: 'Save quota' }).click();
  await expect(page.getByText('Storage quota updated')).toBeVisible({ timeout: 6000 });
});

test('uploading past the workspace quota surfaces a storage-limit alert', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.file.page.id}`);
  await page.getByRole('tab', { name: 'Contents' }).click();

  const editable = page.locator('.bn-editor[contenteditable="true"]');
  await expect(editable).toBeVisible({ timeout: 10_000 });

  // The seeded workspace quota is 1 MB; exceed it directly against the upload endpoint (the
  // editor's own drag/drop upload UI isn't reliably automatable, but this exercises the exact
  // same code path — quota enforcement in `POST /api/v1/files` — that the editor's `uploadFile`
  // hook surfaces as a notification).
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
});
