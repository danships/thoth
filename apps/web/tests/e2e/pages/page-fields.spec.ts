import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('Page fields section renders columns in the DataView order and edits persist', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.fieldsTab.page.id}`);

  // The seeded DataView lists the columns in reverse order relative to the data source's own
  // stored column order (Beta, then Alpha) — assert the Fields tab follows the view's order.
  const [betaLabel, alphaLabel] = await Promise.all([
    page.getByText('Beta', { exact: true }),
    page.getByText('Alpha', { exact: true }),
  ]);

  await expect(betaLabel).toBeVisible();
  await expect(alphaLabel).toBeVisible();

  const betaBox = await betaLabel.boundingBox();
  const alphaBox = await alphaLabel.boundingBox();
  expect(betaBox).not.toBeNull();
  expect(alphaBox).not.toBeNull();
  expect(betaBox!.y).toBeLessThan(alphaBox!.y);

  // THOTH-053 regression: the Fields tab is a plain-text editing surface — even though the
  // seeded "Alpha" value looks like Markdown, it must show up literally (asterisks and all),
  // never rendered bold, and must not adopt the Data View's click-to-edit interaction.
  const alphaRow = page.getByText('Alpha', { exact: true }).locator('..');
  const alphaValue = alphaRow.locator('[contenteditable="true"]');
  await expect(alphaValue).toHaveText(SEED.fieldsTab.page.alphaValue);
  await expect(alphaRow.locator('strong')).toHaveCount(0);

  // Edit the "Alpha" text field.
  await alphaValue.click();
  await alphaValue.press('ControlOrMeta+A');
  await alphaValue.pressSequentially('Updated alpha');
  await alphaValue.press('Enter');
  await expect(alphaValue).toHaveText('Updated alpha');

  // Reload and confirm the change was persisted server-side, not just optimistically applied.
  await page.reload();
  const alphaValueAfterReload = page
    .getByText('Alpha', { exact: true })
    .locator('..')
    .locator('[contenteditable="true"]');
  await expect(alphaValueAfterReload).toHaveText('Updated alpha');
});
