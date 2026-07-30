import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('page with a direct child shows the Sub Pages tab listing it', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  const subPagesTab = page.getByRole('tab', { name: 'Sub Pages' });
  await expect(subPagesTab).toBeVisible();

  await subPagesTab.click();
  await expect(page.getByRole('link', { name: new RegExp(SEED.pages.child.name) })).toBeVisible();
});

test('clicking a listed sub page navigates to it', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await page.getByRole('tab', { name: 'Sub Pages' }).click();

  await page.getByRole('link', { name: new RegExp(SEED.pages.child.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/pages/${SEED.pages.child.id}$`));
  await expect(page.getByRole('heading', { name: SEED.pages.child.name })).toBeVisible();
});

test('leaf page does not show a Sub Pages tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
  await expect(page.getByRole('heading', { name: SEED.pages.child.name })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sub Pages' })).toHaveCount(0);
});

test('page with many children lists them all in the Sub Pages tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.childOverflowHost.id}`);
  await page.getByRole('tab', { name: 'Sub Pages' }).click();

  const firstChild = SEED.pages.childOverflowHost.children.at(0)!;
  const lastChild = SEED.pages.childOverflowHost.children.at(-1)!;
  await expect(page.getByRole('link', { name: new RegExp(firstChild.name) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(lastChild.name) })).toBeVisible();
});

test('page menu can create a child page and navigates to it', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
  await page.getByRole('button', { name: 'Page menu' }).click();
  await page.getByRole('menuitem', { name: 'Add Child Page' }).click();

  await expect(page).toHaveURL(new RegExp(`/pages/${SEED.pages.child.id}/create$`));
  await expect(page.getByRole('heading', { name: 'Create New Page' })).toBeVisible();

  const uniqueName = `E2E Child Of Leaf ${Date.now()}`;
  await page.getByLabel('Page Name').fill(uniqueName);
  await page.getByRole('button', { name: 'Create Page' }).click();

  await expect(page.getByRole('heading', { name: uniqueName })).toBeVisible();
});
