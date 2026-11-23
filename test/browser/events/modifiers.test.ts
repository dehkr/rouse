import { describe, expect, it, vi } from 'vite-plus/test';
import { compileModifiers } from '../../../src/dom/modifiers';
import type { TriggerModifiers } from '../../../src/types';
import { HttpResponse, http, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

const el = document.createElement('button');

const passes = (options: TriggerModifiers, event: Event) =>
  compileModifiers(el, options)(event);

const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: k, ...init });

const click = (init: MouseEventInit = {}) => new MouseEvent('click', init);

describe('compileModifiers', () => {
  it('matches a key exactly unless loose', () => {
    expect(passes({ key: 'enter' }, key('Enter'))).toBe(true);
    expect(passes({ key: 'enter' }, key('Enter', { shiftKey: true }))).toBe(false);
    expect(passes({ key: 'enter', loose: true }, key('Enter', { shiftKey: true }))).toBe(
      true,
    );
  });

  it('requires a system modifier stated with a key to be held', () => {
    expect(passes({ key: 's', ctrl: true }, key('s', { ctrlKey: true }))).toBe(true);
    expect(passes({ key: 's', ctrl: true }, key('s'))).toBe(false);
  });

  it('matches nothing with a system modifier alone on a keyboard event', () => {
    expect(passes({ ctrl: true }, key('a', { ctrlKey: true }))).toBe(false);
  });

  it('filters a mouse event on a system modifier, exactly unless loose', () => {
    expect(passes({ ctrl: true }, click({ ctrlKey: true }))).toBe(true);
    expect(passes({ ctrl: true }, click())).toBe(false);
    expect(passes({ ctrl: true }, click({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(
      passes({ ctrl: true, loose: true }, click({ ctrlKey: true, shiftKey: true })),
    ).toBe(true);
  });

  it('matches a modifier key on its own flag', () => {
    expect(passes({ key: 'shift' }, key('Shift', { shiftKey: true }))).toBe(true);
    expect(passes({ key: 'control' }, key('Control', { ctrlKey: true }))).toBe(true);
  });

  it('passes a bare trigger whatever modifiers are held', () => {
    expect(passes({}, key('a', { shiftKey: true }))).toBe(true);
    expect(passes({}, click({ metaKey: true }))).toBe(true);
  });
});

describe('link navigation', () => {
  /**
   * Clicks `link` and returns whether Rouse prevented the default. A listener on
   * `document` hears the click after Rouse and cancels it, so the test frame stays put.
   */
  function clickLink(link: Element, init: MouseEventInit = {}): boolean {
    let prevented = false;
    const probe = (e: Event) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener('click', probe, { once: true });
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ...init }),
    );
    return prevented;
  }

  /** Mocks `/api/page` and counts the requests that reach it. */
  function page() {
    const hit = vi.fn(() => new HttpResponse('<p>loaded</p>'));
    worker.use(http.get('/api/page', hit));
    return hit;
  }

  it('leaves a click with a system modifier held to the browser', async () => {
    const hit = page();
    const { $ } = await mount(
      `<a href="/api/page" data-rz-fetch="click|once" data-rz-place="null">Page</a>`,
    );

    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      expect(clickLink($('a'), init)).toBe(false);
    }

    // `once` is still armed, so a plain click fetches
    expect(clickLink($('a'))).toBe(true);
    await expect.poll(() => hit).toHaveBeenCalledOnce();
  });

  it('fetches on a modified click the trigger names', async () => {
    const hit = page();
    const { $ } = await mount(
      `<a href="/api/page" data-rz-fetch="click|ctrl" data-rz-place="null">Page</a>`,
    );

    expect(clickLink($('a'), { ctrlKey: true })).toBe(true);
    await expect.poll(() => hit).toHaveBeenCalledOnce();
  });

  // `window` is left out: its listener runs after the probe on `document`
  for (const target of ['outside', 'document', 'root']) {
    it(`leaves another link's clicks to the browser on click|${target}`, async () => {
      const run = vi.fn();
      const { $ } = await mount(
        `<div data-rz-scope="s">
          <a class="host" href="/elsewhere" data-rz-on="click|${target}: run">Host</a>
          <a class="other" href="/elsewhere">Other</a>
        </div>`,
        { scopes: { s: () => ({ run }) } },
      );

      expect(clickLink($('.other'))).toBe(false);
      expect(clickLink($('.other'), { ctrlKey: true })).toBe(false);
      expect(run).toHaveBeenCalledTimes(2);
    });
  }
});
