/**
 * E2E user flow tests — signup, login, navigation.
 * Signup success needs API; this file asserts stable UI + safe failure modes.
 * https://milloapp.com
 */
import { test, expect } from '@playwright/test';

test('signup page — form ready (no flaky API assertion)', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.locator('#reg-displayName')).toBeVisible();
  await expect(page.locator('#reg-username')).toBeVisible();
  await expect(page.locator('#reg-email')).toBeVisible();
  await expect(page.locator('#reg-password')).toBeVisible();
  await expect(page.locator('button[type=submit]')).toBeVisible();
});

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('#login-email')).toBeVisible({ timeout: 5000 });
});

test('login flow (invalid credentials)', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#login-email', 'invalid@test.com');
  await page.fill('#login-password', 'wrongpassword');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
});

test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/');
});
