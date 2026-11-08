import { expect, open, test } from './fixtures';

test('navigates the page on Rouse-Redirect', async ({ page }) => {
  await open(page, '/navigation.html');
  await page.click('#redirect-header');
  await expect(page).toHaveURL('/landing.html?via=header');
  await expect(page.locator('h1')).toHaveText('Landed');
});

test('navigates to the final URL of a same-origin redirect', async ({ page }) => {
  await open(page, '/navigation.html');
  await page.click('#redirect-302');
  await expect(page).toHaveURL('/api/after-redirect');
});

test('pushes a history entry with Rouse-Push-Url that Back undoes', async ({ page }) => {
  await open(page, '/navigation.html');
  await page.click('#tab-2');
  await expect(page.locator('#panel')).toHaveText('tab 2');
  await expect(page).toHaveURL('/navigation.html?tab=2');

  await page.goBack();
  await expect(page).toHaveURL('/navigation.html');
});
