import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.use({ storageState: { cookies: [], origins: [] } });

test('shows email and password fields in credentials mode', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});

test('shows error notification on invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.locator('input[type="password"]').fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 6000 });
});

test('shows link to sign-up page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
});

test('redirects to /pages then to the most recently updated page after successful login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED.user.email);
  await page.locator('input[type="password"]').fill(SEED.user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(`/pages/${SEED.pages.root.id}`, { timeout: 10_000 });
});
