import { expect, test as base, type Page } from '@playwright/test';

/** Which build a page loads: the minified one users ship, or the development one. */
export type Build = 'min' | 'dev';

/** Opens a fixture page on `build` and waits for `rz:app:ready`. */
export async function open(page: Page, path: string, build: Build = 'min') {
  const url =
    build === 'dev' ? `${path}${path.includes('?') ? '&' : '?'}build=dev` : path;
  await page.goto(url);
  await expect(page.locator('html[data-ready]')).toBeAttached();
}

/**
 * Collects console warnings and errors, and uncaught page errors. A spec asserts on
 * them; anything left over fails the test, so a quiet page stays quiet.
 */
export const test = base.extend<{ console: string[] }>({
  console: async ({ page }, use) => {
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' || msg.type() === 'error') {
        messages.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
    await use(messages);
  },
});

export { expect };
