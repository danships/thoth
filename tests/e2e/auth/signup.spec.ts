import { test, expect } from '../fixtures/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('renders signup form fields', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm Password')).toBeVisible();
});

test('shows validation error when passwords do not match', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Test User');
  await page.getByLabel('Email').fill('newuser@test.local');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm Password').fill('Different123!');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page.getByText('Passwords do not match')).toBeVisible();
});

test('shows link to login page', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
