import { test, expect } from '../fixtures/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('shows email and password fields in credentials mode', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});

test('shows error notification on invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 6_000 });
});

test('shows link to sign-up page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
});
