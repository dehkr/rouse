import { expect, open, test } from './fixtures';

for (const [status, terminal] of [
  [200, 'success'],
  [401, 'error'],
] as const) {
  test(`fires :${terminal} for a ${status}, then navigates on Rouse-Redirect`, async ({
    page,
  }) => {
    await open(page, '/navigation.html');
    await page.click(`#redirect-${status}`);
    await expect(page).toHaveURL('/landing.html?via=header');
    await expect(page.locator('h1')).toHaveText('Landed');
    expect(await page.evaluate(() => sessionStorage.getItem('terminal'))).toBe(
      `${terminal} ${status}`,
    );
  });
}

test('places the final response of a followed redirect without navigating', async ({
  page,
}) => {
  await open(page, '/navigation.html');
  await page.click('#redirect-302');
  await expect(page.locator('#followed')).toHaveText('followed');
  await expect(page).toHaveURL('/navigation.html');
});
