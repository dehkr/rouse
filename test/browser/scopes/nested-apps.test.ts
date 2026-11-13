import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { rouse } from '../../../src/index';
import type { RouseApp } from '../../../src/app';
import { mount, nextFrame } from '../helpers/mount';

const nested: RouseApp[] = [];

afterEach(() => {
  for (const app of nested.splice(0)) app.destroy();
});

/** Creates an app on `root` with a `label` store that records clicks under `name`. */
function labelApp(root: HTMLElement, name: string, hits: string[]) {
  const app = rouse({ root });
  nested.push(app);
  app.store('label', {
    text: name,
    hit() {
      hits.push(name);
    },
  });
  return app;
}

// A nested app root inside an outer scope: neither app's `closest(scope)` may cross it
const MARKUP = `
  <section data-rz-scope="outer">
    <div id="inner">
      <span data-rz-text="@label.text"></span>
      <button data-rz-on="click: @label.hit"></button>
    </div>
  </section>`;

const outerStores = (hits: string[]) => ({
  label: {
    text: 'outer',
    hit() {
      hits.push('outer');
    },
  },
});

describe('nested app inside an outer scope', () => {
  it('owns its elements when created before the outer app starts', async () => {
    const hits: string[] = [];
    let inner!: RouseApp;
    const { $ } = await mount(MARKUP, {
      scopes: { outer: () => ({}) },
      stores: outerStores(hits),
      setup: (app) => {
        inner = labelApp(app.root.querySelector('#inner')!, 'inner', hits);
      },
    });
    inner.start();
    await nextFrame();

    expect($('span').textContent).toBe('inner');
    $('button').click();
    expect(hits).toEqual(['inner']);
  });

  it('owns its elements when created after the outer app starts', async () => {
    const hits: string[] = [];
    const { $ } = await mount(MARKUP, {
      scopes: { outer: () => ({}) },
      stores: outerStores(hits),
    });
    expect($('span').textContent).toBe('outer');

    labelApp($('#inner'), 'inner', hits).start();
    await nextFrame();

    expect($('span').textContent).toBe('inner');
    $('button').click();
    expect(hits).toEqual(['inner']);
  });

  it('owns markup added to it later', async () => {
    const hits: string[] = [];
    let inner!: RouseApp;
    const { $ } = await mount(MARKUP, {
      scopes: { outer: () => ({}) },
      stores: outerStores(hits),
      setup: (app) => {
        inner = labelApp(app.root.querySelector('#inner')!, 'inner', hits);
      },
    });
    inner.start();

    $('#inner').insertAdjacentHTML('beforeend', '<b data-rz-text="@label.text"></b>');
    await nextFrame();

    expect($('b').textContent).toBe('inner');
  });

  it("doesn't fire its wake trigger when the outer scope connects", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hits: string[] = [];
    let inner!: RouseApp;
    await mount(MARKUP.replace('click: @label.hit', 'wake: @label.hit'), {
      scopes: { outer: () => ({}) },
      stores: outerStores(hits),
      setup: (app) => {
        inner = labelApp(app.root.querySelector('#inner')!, 'inner', hits);
      },
    });
    inner.start();
    await nextFrame();

    expect(hits).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`'wake' trigger requires an enclosing scope`),
      expect.anything(),
    );
    warn.mockRestore();
  });
});
