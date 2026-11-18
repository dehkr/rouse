import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Build, expect, open, test } from './fixtures';

const DIST = join(import.meta.dirname, '../../dist');
const PLUGIN_FILES = ['sync.js', 'sync.min.js', 'sse.js', 'sse.min.js'];

// A plugin that imported a file would reach core through a second URL and run a
// second copy of it
test('plugin files import nothing', async () => {
  for (const file of PLUGIN_FILES) {
    const code = await readFile(join(DIST, file), 'utf8');
    expect(code, file).not.toMatch(/\bimport\s*[\s{*("'`]|\bfrom\s*["'`]/);
  }
});

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

    test('installs plugins loaded by URL', async ({ page, console }) => {
      await open(page, '/plugins.html', build);

      const names = await page.evaluate(() =>
        (window as any).app.config.plugins.map((plugin: { name: string }) => plugin.name),
      );
      expect(names).toEqual(['sync', 'sse']);
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
