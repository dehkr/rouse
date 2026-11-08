import { expect, open, test } from './fixtures';

test.beforeEach(async ({ request }) => {
  await request.post('/api/reset');
});

test('pulls on ready, then pushes an edit and merges the server reply', async ({
  page,
  request,
}) => {
  await open(page, '/store.html');
  await expect(page.locator('#name')).toHaveValue('Ada');
  await expect(page.locator('#dirty')).not.toHaveClass(/unsaved/);

  await page.fill('#name', 'Grace');
  await expect(page.locator('#dirty')).toHaveClass(/unsaved/);

  await page.click('#save');
  await expect(page.locator('#saved-at')).toHaveText(/^\d+$/);
  await expect(page.locator('#dirty')).not.toHaveClass(/unsaved/);

  const log = await (await request.get('/api/log')).json();
  const push = log.find((entry: { method: string }) => entry.method === 'PATCH');
  expect(push.headers['content-type']).toBe('application/merge-patch+json');
  expect(push.headers['rouse-sync']).toBe('push');

  const server = await (await request.get('/api/store')).json();
  expect(server.name).toBe('Grace');
});
