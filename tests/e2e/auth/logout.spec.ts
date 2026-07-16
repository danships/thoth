import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Logging out invalidates the underlying better-auth session. The default storageState
// (from global.setup.ts) is shared across every other spec in the suite, so signing out
// with that session would break all subsequent tests. To keep this test isolated, it signs
// in with its own dedicated session before exercising the logout flow.
test.use({ storageState: { cookies: [], origins: [] } });

test('navigating to /logout redirects away from the logout page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED.user.email);
  await page.locator('input[type="password"]').fill(SEED.user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL('/', { timeout: 10_000 });

  await page.goto('/logout');
  await expect(page).not.toHaveURL('/logout', { timeout: 5000 });
});
