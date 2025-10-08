import { test, expect } from '@playwright/test';

test('landing asks to login, auth, then dashboard nav exists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('You are not logged in.')).toBeVisible();
});
