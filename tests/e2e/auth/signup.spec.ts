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

test('redirects to /pages then to the new user default Welcome page after successful signup', async ({ page }) => {
  const uniqueEmail = `e2e-signup-${Date.now()}@test.local`;

  await page.goto('/signup');
  await page.getByLabel('Name').fill('New E2E User');
  await page.getByLabel('Email').fill(uniqueEmail);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page).toHaveURL(/\/pages\/(?!create)[^/]+$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});
