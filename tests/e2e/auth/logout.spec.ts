import { test, expect } from '../fixtures/test';

test('navigating to /logout redirects away from the logout page', async ({ page }) => {
  await page.goto('/logout');
  await expect(page).not.toHaveURL('/logout', { timeout: 5_000 });
});
