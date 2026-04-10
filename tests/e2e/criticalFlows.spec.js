/**
 * Stable E2E coverage — login, payments surface, live viewer route.
 * Full login/payment API success requires backend + E2E_USER_EMAIL / E2E_USER_PASSWORD.
 * https://milloapp.com
 */
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('login page — email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
  });

  test('login — invalid credentials stay on login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('e2e-invalid@milloapp.com');
    await page.locator('#login-password').fill('WrongPassword!1');
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('login — success when API credentials provided', async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD for full login E2E');

    await page.goto('/login');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 25_000 });
  });
});

test.describe('Payment (coin store)', () => {
  test('coin store loads — hero and packs region', async ({ page }) => {
    await page.goto('/coins');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByText(/instant|delivery|regional|coins|never/i).first()).toBeVisible();
  });
});

test.describe('Livestream join', () => {
  test('live viewer route — not-found UX for missing stream (join surface)', async ({ page }) => {
    const fakeId = '507f1f77bcf86cd799439011';
    await page.goto(`/live/${fakeId}`);
    await expect(page.getByText(/stream not found|no longer available/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('a[href="/live"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /back|retour|volver|voltar/i })).toBeVisible();
  });

  test('live hub loads', async ({ page }) => {
    await page.goto('/live');
    await expect(page).toHaveURL(/\/live\/?$/);
  });
});
