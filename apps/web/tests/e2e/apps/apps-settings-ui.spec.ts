import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers the THOTH-026 "Apps" settings screen: the nav entry point, creating an App through
// the form modal, minting a key and seeing its one-time secret, and archiving the App.
test.describe('Apps settings UI', () => {
  test('Apps link is reachable from the workspace menu', async ({ page }) => {
    // Navigate directly to a known page without any linked views, rather than the generic
    // `/pages` redirect-to-most-recently-updated-page flow: since DECISION 1 (THOTH-042) made
    // that landing page workspace-scoped (any root page, not just `SEED.pages.root`), it can
    // land on a page with a view (e.g. `dataSourceHost`), whose client-side `?v=` replace can
    // race with (and clobber) the settings navigation triggered below (see the matching comment
    // in `workspace-menu.spec.ts`). `SEED.pages.root` has no views, so this sidesteps the race.
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await page.getByRole('menuitem', { name: 'Apps' }).click();

    await expect(page).toHaveURL(`/${SEED.workspace.slug}/settings/apps`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  });

  test('can create an App, mint a key, view its one-time secret, and archive the App', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E UI App ${Date.now()}`;

    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.click();
    await expect(page).toHaveURL(/\/settings\/apps\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: label })).toBeVisible();

    await page.getByLabel('New key label').fill('e2e-key');
    await page.getByRole('button', { name: 'Create key' }).click();

    await expect(page.getByText('Copy this key now')).toBeVisible({ timeout: 10_000 });
    const secretInput = page.getByLabel('API key secret');
    await expect(secretInput).toHaveValue(/^thk_/);

    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('link', { name: /Back to Apps/ }).click();
    await expect(page).toHaveURL(`/${SEED.workspace.slug}/settings/apps`, { timeout: 15_000 });

    const archivedRow = page.getByRole('row', { name: new RegExp(label) });
    await archivedRow.getByRole('button', { name: 'Archive App' }).click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();

    await expect(archivedRow.getByText('Archived')).toBeVisible({ timeout: 10_000 });
  });

  test('can mint a key with an expiration date, shown afterwards in the keys table', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E Expiry UI App ${Date.now()}`;

    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page).toHaveURL(/\/settings\/apps\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: label })).toBeVisible();

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const expiresAtValue = nextYear.toISOString().slice(0, 16);

    await page.getByLabel('New key label').fill('e2e-expiring-key');
    await page.getByLabel('Expires at').fill(expiresAtValue);

    const [createKeyResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/keys') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create key' }).click(),
    ]);
    const createKeyBody = await createKeyResponse.json();
    expect(createKeyBody.data.expiresAt).not.toBeNull();

    await expect(page.getByText('Copy this key now')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    const keyRow = page.getByRole('row', { name: /e2e-expiring-key/ });
    await expect(keyRow).toBeVisible();
    const expectedExpiresLabel = nextYear.toLocaleDateString();
    await expect(keyRow.getByRole('cell', { name: expectedExpiresLabel })).toBeVisible();
  });

  test('editing an App pre-fills the form with its existing details', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E Edit UI App ${Date.now()}`;

    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('combobox', { name: 'Permission' }).click();
    await page.getByRole('option', { name: 'Read & write' }).click();
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Edit App' }).click();

    await expect(page.getByRole('heading', { name: 'Edit App' })).toBeVisible();
    await expect(page.getByLabel('Label')).toHaveValue(label);
    await expect(page.getByRole('combobox', { name: 'Permission' })).toHaveValue('Read & write');

    const updatedLabel = `${label} - updated`;
    await page.getByLabel('Label').fill(updatedLabel);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('row', { name: new RegExp(updatedLabel) })).toBeVisible({ timeout: 10_000 });
  });

  // THOTH-061: webhook delivery execution moved to `@thoth/jobs`; this covers the resulting
  // async lifecycle in the UI (Pending/Retrying badges, a disabled Resend button while a
  // delivery is already in flight, and no duplicate row for the same webhook after resend).
  test('a webhook delivery shows Pending/Retrying, disables Resend while active, and reaches a terminal state on the same row', async ({
    page,
  }) => {
    // Full retry exhaustion against an unreachable URL (5 attempts, each with its own network
    // timeout, plus backoff) legitimately takes longer than the suite's default 30s test
    // timeout — extend just this test rather than the whole suite.
    test.setTimeout(120_000);

    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E Webhook Delivery App ${Date.now()}`;
    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page).toHaveURL(/\/settings\/apps\/[^/]+$/, { timeout: 15_000 });

    // An unreachable-but-well-formed HTTPS URL (documentation/test range, RFC 5737) — the SSRF
    // guard accepts it at config time (public, https), but every delivery attempt against it
    // times out, so the delivery stays non-terminal (`pending`/`retrying`) long enough to assert
    // the in-flight UI, without depending on any real external endpoint.
    await page.getByLabel('Label', { exact: true }).fill('Delivery watcher');
    await page.getByLabel('URL').fill('https://192.0.2.1/webhooks/thoth-e2e');
    await page.getByRole('button', { name: 'Add webhook' }).click();

    // Creating a webhook shows its one-time signing secret in a modal (mirrors the API key
    // flow above) — dismiss it before interacting with the rest of the page, since Mantine
    // marks the underlying content inert (and so unreachable via the accessibility tree) while
    // the modal is open.
    await expect(page.getByText('Copy this secret now')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    const webhookRow = page.getByRole('button', { name: /Delivery watcher/ });
    await expect(webhookRow).toBeVisible({ timeout: 10_000 });
    await webhookRow.click();

    await expect(page.getByRole('heading', { name: 'Deliveries' })).toBeVisible();

    // Trigger a page mutation for a page in this workspace via the API (faster/more reliable
    // than driving the page editor through the UI) so the App's webhook receives a
    // `page.updated` event and a delivery row is created.
    await page.request.patch(`/api/v1/pages/${SEED.pages.root.id}`, { data: { name: SEED.pages.root.name } });

    const deliveryRow = page.locator('table tbody tr').last();
    await expect(deliveryRow).toBeVisible({ timeout: 15_000 });
    await expect(deliveryRow.getByText(/Pending|Retrying/)).toBeVisible({ timeout: 15_000 });

    // While the delivery is active, the row's Resend button must stay disabled — clicking
    // resend must never race a running attempt for the same row.
    const resendButton = deliveryRow.getByRole('button', { name: 'Resend delivery' });
    await expect(resendButton).toBeDisabled();

    // The delivery eventually exhausts its retries against the unreachable URL and reaches a
    // terminal state, still on the very same row (no duplicate delivery is ever created for
    // this webhook from a single page mutation).
    await expect(deliveryRow.getByText(/Failed|Success|Cancelled/)).toBeVisible({ timeout: 60_000 });
    await expect(resendButton).toBeEnabled();
    await expect(page.locator('table tbody tr').filter({ hasText: SEED.pages.root.id })).toHaveCount(1);
  });
});
