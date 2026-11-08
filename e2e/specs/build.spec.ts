import { type Build, expect, open, test } from './fixtures';

for (const build of ['min', 'dev'] as Build[]) {
  test.describe(`${build} build`, () => {
    test('binds state, events, models, and lists without console noise', async ({
      page,
      console,
    }) => {
      await open(page, '/smoke.html', build);

      await page.click('#increment');
      await page.click('#increment');
      await expect(page.locator('#count')).toHaveText('2');

      await page.fill('#draft', 'Test');
      await page.click('#add');
      await expect(page.locator('#todos li')).toHaveText(['Ship', 'Test']);
      await expect(page.locator('#draft')).toHaveValue('');

      expect(console).toEqual([]);
    });
  });
}

test('logs authoring warnings only in the development build', async ({
  page,
  console,
}) => {
  await open(page, '/warnings.html', 'dev');
  expect(console.filter((m) => m.includes('[Rouse]')).length).toBeGreaterThanOrEqual(2);

  console.length = 0;
  await open(page, '/warnings.html', 'min');
  expect(console).toEqual([]);
});
