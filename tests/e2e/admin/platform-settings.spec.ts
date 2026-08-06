import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// THOTH-045: the platform administration area. The default e2e user (`SEED.user`) is the
// bootstrapped platform administrator; `SEED.secondUser` is a normal user.
test.describe('platform administration', () => {
  test('the platform admin can view the overview and toggle self-service workspace creation', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible({ timeout: 15_000 });

    const toggle = page.getByLabel('Allow users to create their own workspaces');
    await expect(toggle).toBeVisible();

    const wasChecked = await toggle.isChecked();
    // Flip it, save, and confirm the success notification.
    await toggle.click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Platform settings updated').first()).toBeVisible({ timeout: 10_000 });

    // Restore the original value so other specs (which rely on being able to create workspaces)
    // are unaffected regardless of execution order.
    if (wasChecked !== (await page.getByLabel('Allow users to create their own workspaces').isChecked())) {
      // Dismiss any lingering notification so the next assertion is unambiguous.
      await page.waitForTimeout(500);
      await page.getByLabel('Allow users to create their own workspaces').click();
      await page.getByRole('button', { name: 'Save settings' }).click();
      await expect(page.getByText('Platform settings updated').first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('a non-admin user cannot reach the admin area (404)', async ({ page }) => {
    // Sign in with a dedicated session as the non-admin second user.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email').fill(SEED.secondUser.email);
    await page.locator('input[type="password"]').fill(SEED.secondUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/[^/]+\/pages(\/|$)/, { timeout: 10_000 });

    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
  });
});
