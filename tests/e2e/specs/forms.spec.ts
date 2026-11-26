import { expect, open, test } from './fixtures';

test('submits a form urlencoded to a real server', async ({ page }) => {
  await open(page, '/forms.html');
  await page.click('#plain button');
  await expect(page.locator('#content-type')).toHaveText(
    'application/x-www-form-urlencoded',
  );
  await expect(page.locator('#body')).toHaveText('email=ada%40example.com');
});

test('uploads a file as multipart', async ({ page }) => {
  await open(page, '/forms.html');
  await page.setInputFiles('#upload input[type=file]', {
    name: 'avatar.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('pixels'),
  });
  await page.click('#upload button');
  await expect(page.locator('#content-type')).toHaveText(
    /^multipart\/form-data; boundary=/,
  );
  await expect(page.locator('#body')).toContainText('filename="avatar.txt"');
  await expect(page.locator('#body')).toContainText('pixels');
});
