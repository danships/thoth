import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('displays seeded page title', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
});

test('displays Contents tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('tab', { name: 'Contents' })).toBeVisible();
});

test('shows Add View button', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('button', { name: 'Add View' })).toBeVisible();
});

test('can inline-edit the page title', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  // Use a name-agnostic, role-agnostic locator scoped to the editable title element itself:
  // the page body (BlockNote) can also render `h1`s from markdown content, so a plain
  // `getByRole('heading', { level: 1 })` is no longer guaranteed to be unique.
  const heading = page.locator('h1[contenteditable="true"]');
  await heading.click();
  await heading.press('ControlOrMeta+A');
  await heading.pressSequentially('Renamed E2E Page');
  const [firstUpdateResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/pages/${SEED.pages.root.id}`) && response.ok()),
    heading.press('Enter'),
  ]);
  expect(firstUpdateResponse.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Renamed E2E Page' })).toBeVisible();

  // Restore the seeded name afterwards so other specs that rely on SEED.pages.root.name
  // (a shared, pre-seeded page) keep working regardless of test execution order. We
  // explicitly wait for the PATCH request to resolve before the test ends — otherwise the
  // next test's page.goto() can abort the still in-flight rename request, permanently
  // leaving the shared page renamed for the rest of the suite.
  await heading.click();
  await heading.press('ControlOrMeta+A');
  await heading.pressSequentially(SEED.pages.root.name);
  const [restoreResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/pages/${SEED.pages.root.id}`) && response.ok()),
    heading.press('Enter'),
  ]);
  expect(restoreResponse.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
});

test('block editor is visible on the Contents tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 10_000 });
});

test('seeded markdown renders as rich content', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator('.bn-editor h1', { hasText: SEED.pages.root.contentHeading })).toBeVisible({
    timeout: 10_000,
  });
});

test('edit round-trips after reload', async ({ page }) => {
  const uniqueText = `E2E Round Trip ${Date.now()}`;

  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
  await page.getByRole('tab', { name: 'Contents' }).click();

  const editable = page.locator('.bn-editor[contenteditable="true"]');
  await expect(editable).toBeVisible({ timeout: 10_000 });
  await editable.click();
  await editable.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');

  // Wait for the debounced (1500ms) content POST to resolve, started concurrently with
  // typing so the response can't resolve and be missed before we start listening for it.
  const [contentResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes(`/pages/${SEED.pages.child.id}/content`) && response.ok(),
      { timeout: 15_000 }
    ),
    page.keyboard.type(uniqueText),
  ]);
  expect(contentResponse.ok()).toBe(true);

  await page.reload();
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 });
});

test('child page shows breadcrumb trail back to parent', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
  await expect(page.getByText(SEED.pages.root.name)).toBeVisible();
});

test('page nested under a data source row shows breadcrumb back through the hosting page', async ({ page }) => {
  // Reproduces: root page -> sub-page -> data source (hosted on the sub-page via a view)
  // -> row page. The row's parentId points at the data source container rather than the
  // sub-page, so this asserts the breadcrumb still bridges through to the sub-page and root.
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.breadcrumbRowPage.id}`);
  await expect(page.getByRole('heading', { name: SEED.breadcrumbRowPage.name })).toBeVisible();

  const breadcrumb = page.getByLabel('Breadcrumb', { exact: true });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByText(SEED.pages.root.name)).toBeVisible();
  await expect(breadcrumb.getByText(SEED.pages.breadcrumbDataSourceHost.name)).toBeVisible();
});

test('data-source host page shows the seeded view tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await expect(page.getByRole('tab', { name: SEED.dataView.name })).toBeVisible();
});

test('root page does not show a breadcrumb', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
  await expect(page.locator('[aria-label="Breadcrumb"]')).toHaveCount(0);
});

test('deeply nested page collapses breadcrumb into a dropdown', async ({ page }) => {
  // Use a narrow viewport so the full breadcrumb trail cannot fit and the ellipsis
  // dropdown deterministically appears, regardless of the actual page name lengths.
  await page.setViewportSize({ width: 375, height: 800 });

  const deepChain = SEED.pages.deepChain;
  const lastPage = deepChain.at(-1)!;
  await page.goto(`/${SEED.workspace.slug}/pages/${lastPage.id}`);
  await expect(page.getByRole('heading', { name: lastPage.name })).toBeVisible();

  const ellipsisTrigger = page.getByRole('button', { name: 'Show hidden breadcrumb pages' });
  await expect(ellipsisTrigger).toBeVisible();

  const visibleBreadcrumb = page.getByLabel('Breadcrumb', { exact: true });

  // Root and current page remain visible outside the dropdown.
  await expect(visibleBreadcrumb.getByText(SEED.pages.root.name)).toBeVisible();

  await ellipsisTrigger.click();
  const middlePages = deepChain.slice(0, -1);
  for (const middlePage of middlePages) {
    await expect(page.getByRole('menuitem', { name: middlePage.name })).toBeVisible();
  }
});
