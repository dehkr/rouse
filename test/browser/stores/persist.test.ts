import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { reactive, rouse } from '../../../src/index';
import type { RouseApp } from '../../../src/app';
import { mount, nextFrame } from '../helpers/mount';

const KEY = 'rouse-persist-test';
const saved = () => JSON.parse(localStorage.getItem(KEY)!);

let warnings: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  warnings = vi.spyOn(console, 'warn');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('persisted reactive() in a scope', () => {
  const counter = () => {
    const state = reactive({ count: 0 }, { persist: 'local', persistKey: KEY });
    return {
      state,
      add() {
        state.count++;
      },
    };
  };
  const MARKUP = `<div id="host" data-rz-scope="counter">
    <span data-rz-text="state.count"></span>
    <button data-rz-on="click: add"></button>
  </div>`;

  it('stops saving after the scope tears down', async () => {
    let state!: { count: number };
    const { $ } = await mount(MARKUP, {
      scopes: {
        counter: () => {
          const instance = counter();
          state = instance.state;
          return instance;
        },
      },
    });
    $('button').click();
    expect(saved()).toEqual({ count: 1 });

    $('#host').remove();
    await nextFrame();
    state.count = 5;

    expect(saved()).toEqual({ count: 1 });
  });

  it("restores the old instance's data after an outerHTML swap, without a warning", async () => {
    const { $ } = await mount(MARKUP, { scopes: { counter } });
    $('button').click();
    $('button').click();

    $('#host').outerHTML = MARKUP;
    await nextFrame();

    expect($('span').textContent).toBe('2');
    $('button').click();
    expect(saved()).toEqual({ count: 3 });
    expect(warnings).not.toHaveBeenCalled();
  });
});

describe('persisted store', () => {
  const persist = { persist: 'local', persistKey: KEY } as const;

  it('restores on creation, and reset() restores the declared data', async () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'dark' }));
    const { app, $ } = await mount(`<span data-rz-text="@prefs.theme"></span>`, {
      setup: (app) => app.store('prefs', { theme: 'light' }, persist),
    });

    expect($('span').textContent).toBe('dark');
    expect(app.stores.isDirty('prefs')).toBe(false);

    app.stores.reset('prefs');

    expect(app.stores.get('prefs').theme).toBe('light');
    expect(saved()).toEqual({ theme: 'light' });
  });

  it('stops saving on remove(), keeping the saved entry', async () => {
    const { app } = await mount('', {
      setup: (app) => app.store('prefs', { theme: 'light' }, persist),
    });
    const prefs = app.stores.get('prefs');
    prefs.theme = 'dark';

    app.stores.remove('prefs');
    prefs.theme = 'blue';

    expect(saved()).toEqual({ theme: 'dark' });
  });

  it('stops saving when the app is destroyed', async () => {
    const { app } = await mount('', {
      setup: (app) => app.store('prefs', { theme: 'light' }, persist),
    });
    const prefs = app.stores.get('prefs');

    app.destroy();
    prefs.theme = 'dark';

    expect(saved()).toEqual({ theme: 'light' });
  });

  it('keeps saving after the scope that created it tears down', async () => {
    const { app, $ } = await mount('<div id="host" data-rz-scope="maker"></div>', {
      scopes: {
        maker: ({ app }) => {
          app.store('prefs', { theme: 'light' }, persist);
          return {};
        },
      },
    });

    $('#host').remove();
    await nextFrame();
    app.stores.get('prefs').theme = 'dark';

    expect(saved()).toEqual({ theme: 'dark' });
  });

  it('throws with a url, or without a persistKey', async () => {
    const { app } = await mount('');

    expect(() => app.store('a', {}, { ...persist, url: '/api/prefs' })).toThrow(/url/);
    expect(() => app.store('b', {}, { persist: 'local' } as any)).toThrow(/persistKey/);
    expect(app.stores.has('a')).toBe(false);
    expect(app.stores.has('b')).toBe(false);
  });

  it('throws when config() adds a url to a persisted store', async () => {
    const { app } = await mount('', {
      setup: (app) => app.store('prefs', {}, persist),
    });

    expect(() => app.stores.config('prefs', { url: '/api/prefs' })).toThrow(/url/);
  });

  it('warns when two apps share a persistKey', async () => {
    // The duplicate warning latches per key for the page, so this key is used only here
    const persist = { persist: 'local', persistKey: `${KEY}-shared` } as const;
    const { app } = await mount('', {
      setup: (app) => app.store('prefs', { theme: 'light' }, persist),
    });
    const root = document.createElement('div');
    document.body.append(root);
    let other: RouseApp | undefined;
    try {
      other = rouse({ root });
      other.store('prefs', { theme: 'light' }, persist);
      await nextFrame();

      expect(warnings).toHaveBeenCalledOnce();
      expect(warnings.mock.calls[0][0]).toContain(persist.persistKey);
    } finally {
      other?.stores.remove('prefs');
      root.remove();
      app.stores.remove('prefs');
    }
  });
});
