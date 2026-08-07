import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import { dragHandleOnto } from '../utils/drag-and-drop';

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
  await expect(page).toHaveURL(new RegExp(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}$`));
  await expect(page.getByRole('heading', { name: SEED.pages.child.name })).toBeVisible();
});

test('leaf page does not show a Sub Pages tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}?v=subpages`);
  await expect(page).toHaveURL(
    new RegExp(String.raw`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}\?v=contents$`)
  );
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

// THOTH-036: drag-and-drop reordering of the child list in the Sub Pages tab. Uses two children
// further down `childOverflowHost`'s list (not the first two, which `pages-tree-reorder.spec.ts`
// already reorders) so the two specs' mutations don't race on the same pair.
test('dragging a sub page reorders the Sub Pages list and persists across reload', async ({ page }) => {
  const first = SEED.pages.childOverflowHost.children.at(2)!;
  const second = SEED.pages.childOverflowHost.children.at(3)!;

  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.childOverflowHost.id}`);
  await page.getByRole('tab', { name: 'Sub Pages' }).click();

  const firstHandle = page.getByTestId(`subpage-drag-handle-${first.id}`);
  const secondHandle = page.getByTestId(`subpage-drag-handle-${second.id}`);
  await expect(firstHandle).toBeVisible();
  await expect(secondHandle).toBeVisible();

  const reorderResponse = page.waitForResponse(
    (response) => response.url().includes(`/api/v1/pages/${second.id}/reorder`) && response.request().method() === 'POST'
  );
  await dragHandleOnto(page, secondHandle, firstHandle);
  await reorderResponse;

  await expect(async () => {
    const firstBox = await page.getByRole('link', { name: new RegExp(first.name) }).boundingBox();
    const secondBox = await page.getByRole('link', { name: new RegExp(second.name) }).boundingBox();
    expect(firstBox).toBeTruthy();
    expect(secondBox).toBeTruthy();
    expect(secondBox!.y).toBeLessThan(firstBox!.y);
  }).toPass({ timeout: 10_000 });

  await page.reload();
  await page.getByRole('tab', { name: 'Sub Pages' }).click();
  const firstBoxAfterReload = await page.getByRole('link', { name: new RegExp(first.name) }).boundingBox();
  const secondBoxAfterReload = await page.getByRole('link', { name: new RegExp(second.name) }).boundingBox();
  expect(secondBoxAfterReload!.y).toBeLessThan(firstBoxAfterReload!.y);
});

test('page menu can create a child page and navigates to it', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
  await page.getByRole('button', { name: 'Page menu' }).click();
  await page.getByRole('menuitem', { name: 'Add Child Page' }).click();

  await expect(page).toHaveURL(new RegExp(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}/create$`));
  await expect(page.getByRole('heading', { name: 'Create New Page' })).toBeVisible();

  const uniqueName = `E2E Child Of Leaf ${Date.now()}`;
  await page.getByLabel('Page Name').fill(uniqueName);
  await page.getByRole('button', { name: 'Create Page' }).click();

  await expect(page.getByRole('heading', { name: uniqueName })).toBeVisible();
});
