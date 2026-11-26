import { expect, open, test } from './fixtures';

// `moveBefore()` keeps focus and running transitions through a move; `insertBefore`,
// the fallback, drops both. Each browser checks whichever path it takes.
test('keeps a moved keyed instance’s node and input value, and its focus and transition with moveBefore()', async ({
  page,
  console,
}) => {
  await open(page, '/render.html');
  const supported = await page.evaluate(() => 'moveBefore' in Element.prototype);

  await page.fill('input[name="3"]', 'kept');
  await page.evaluate(() => {
    const li = document.querySelector('input[name="3"]')!.parentElement!;
    (window as any).moved = li;
    li.style.transition = 'opacity 10s';
    // Flush styles so the opacity change starts a transition
    getComputedStyle(li).getPropertyValue('opacity');
    li.style.opacity = '0';
  });

  await page.evaluate(() => (window as any).app.stores.get('rows').lastToFront());

  const after = await page.evaluate(() => {
    const li = document.querySelector('#rows li')!;
    const input = li.querySelector('input')!;
    return {
      sameNode: li === (window as any).moved,
      value: input.value,
      focused: document.activeElement === input,
      transitions: li.getAnimations().length,
    };
  });
  expect(after).toEqual({
    sameNode: true,
    value: 'kept',
    focused: supported,
    transitions: supported ? 1 : 0,
  });
  await expect(page.locator('#rows input')).toHaveCount(3);
  expect(console).toEqual([]);
});
