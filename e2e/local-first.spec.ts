import { test, expect } from '@playwright/test';
// Run against an export with all EXPO_PUBLIC_* integration variables unset.
for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
  test(`empty first launch and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByText('Let’s protect something you own.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    for (const tab of ['Purchases', 'Deadlines', 'Vault', 'Settings']) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await expect(page.getByText('No reminders are being sent', { exact: true })).toBeVisible();
    await expect(page.getByText('Account deletion unavailable in this build', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    await page.reload();
    await expect(page.getByText('Let’s protect something you own.', { exact: true })).toHaveCount(0);
  });
}
