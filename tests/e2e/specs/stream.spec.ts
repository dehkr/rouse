import { expect, open, test } from './fixtures';

test('reconnects after the server drops a stream and resumes from Last-Event-ID', async ({
  page,
}) => {
  await open(page, '/stream.html');
  const items = page.locator('#feed b');
  // The server ends the stream after every second message, so item 4 arrives on a
  // reconnect. No repeats means the reconnect resumed from the last event id.
  await expect(items.nth(3)).toBeAttached();
  expect((await items.allTextContents()).slice(0, 4)).toEqual(['1', '2', '3', '4']);
  expect(await page.evaluate(() => (window as any).opens)).toBeGreaterThanOrEqual(2);
});
