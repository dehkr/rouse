import { describe, expect, it, vi } from 'vite-plus/test';
import { reactive, signal } from '../../../src/index';
import { mount, nextFrame } from '../helpers/mount';

describe('state bindings', () => {
  it('writes scope state as text and updates it on change', async () => {
    const state = reactive({ name: 'Ada' });
    const { $ } = await mount(
      `<div data-rz-scope="profile"><span data-rz-text="name"></span></div>`,
      { scopes: { profile: () => state } },
    );
    expect($('span').textContent).toBe('Ada');
    state.name = 'Grace';
    expect($('span').textContent).toBe('Grace');
  });

  it('reads a store field with @', async () => {
    const { app, $ } = await mount(`<span data-rz-text="@user.name"></span>`, {
      stores: { user: { name: 'Ada' } },
    });
    expect($('span').textContent).toBe('Ada');
    app.stores.get('user')!.name = 'Grace';
    expect($('span').textContent).toBe('Grace');
  });

  it('removes an attribute for false and sets it empty for true', async () => {
    const state = reactive({ off: true });
    const { $ } = await mount(
      `<div data-rz-scope="s"><button data-rz-attr="disabled: off"></button></div>`,
      { scopes: { s: () => state } },
    );
    expect($('button').getAttribute('disabled')).toBe('');
    state.off = false;
    expect($('button').hasAttribute('disabled')).toBe(false);
  });

  it('writes aria-* booleans as "true" and "false"', async () => {
    const state = reactive({ open: false });
    const { $ } = await mount(
      `<div data-rz-scope="s"><button data-rz-attr="aria-expanded: open"></button></div>`,
      { scopes: { s: () => state } },
    );
    expect($('button').getAttribute('aria-expanded')).toBe('false');
    state.open = true;
    expect($('button').getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles each class on the left by the state on the right', async () => {
    const state = reactive({ chosen: false });
    const { $ } = await mount(
      `<div data-rz-scope="s"><p class="keep" data-rz-class="active selected: chosen"></p></div>`,
      { scopes: { s: () => state } },
    );
    state.chosen = true;
    expect([...$('p').classList]).toEqual(['keep', 'active', 'selected']);
    state.chosen = false;
    expect([...$('p').classList]).toEqual(['keep']);
  });

  it('renders a plain field once without updating it', async () => {
    let count = 1;
    const { $ } = await mount(
      `<div data-rz-scope="s"><span data-rz-text="count"></span></div>`,
      { scopes: { s: () => ({ count }) } },
    );
    count = 2;
    expect($('span').textContent).toBe('1');
  });
});

describe('rz-model', () => {
  it('binds a text input both ways through a signal getter and setter', async () => {
    const query = signal('a');
    const { $ } = await mount(
      `<div data-rz-scope="s"><input data-rz-model="query"></div>`,
      {
        scopes: {
          s: () => ({
            get query() {
              return query();
            },
            set query(v: string) {
              query(v);
            },
          }),
        },
      },
    );
    const input = $<HTMLInputElement>('input');
    expect(input.value).toBe('a');

    input.value = 'typed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(query()).toBe('typed');

    query('set');
    expect(input.value).toBe('set');
  });

  it('binds a checkbox on change', async () => {
    const state = reactive({ done: false });
    const { $ } = await mount(
      `<div data-rz-scope="s"><input type="checkbox" data-rz-model="done"></div>`,
      { scopes: { s: () => state } },
    );
    const box = $<HTMLInputElement>('input');
    box.click();
    expect(state.done).toBe(true);
  });
});

describe('rz-on', () => {
  it('calls a scope method with the handler context', async () => {
    const save = vi.fn();
    const { $ } = await mount(
      `<div data-rz-scope="s"><button data-rz-on="click: save">Save</button></div>`,
      { scopes: { s: () => ({ save }) } },
    );
    $('button').click();
    expect(save).toHaveBeenCalledOnce();
    const [ctx] = save.mock.calls[0]!;
    expect(ctx.el).toBe($('button'));
    expect(ctx.e).toBeInstanceOf(MouseEvent);
    expect(ctx.render).toEqual({ item: null, index: null });
  });

  it('applies prevent and once', async () => {
    const send = vi.fn();
    const { $ } = await mount(
      `<div data-rz-scope="s"><form data-rz-on="submit|prevent.once: send"><button>Go</button></form></div>`,
      { scopes: { s: () => ({ send }) } },
    );
    const form = $<HTMLFormElement>('form');
    const first = new SubmitEvent('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(first);
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(first.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it('filters keys with key-[]', async () => {
    const submit = vi.fn();
    const { $ } = await mount(
      `<div data-rz-scope="s"><input data-rz-on="keydown|key-[enter]: submit"></div>`,
      { scopes: { s: () => ({ submit }) } },
    );
    const input = $('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe('scope lifecycle', () => {
  it('runs setup, connect, and disconnect in order and aborts term on teardown', async () => {
    const order: string[] = [];
    let term: AbortSignal | undefined;
    const { $ } = await mount(`<div id="host" data-rz-scope="s"></div>`, {
      scopes: {
        s: (ctx) => {
          order.push('setup');
          term = ctx.term;
          return {
            connect: () => order.push('connect'),
            disconnect: () => order.push('disconnect'),
          };
        },
      },
    });
    expect(order).toEqual(['setup', 'connect']);

    $('#host').remove();
    await nextFrame();
    expect(order).toEqual(['setup', 'connect', 'disconnect']);
    expect(term?.aborted).toBe(true);
  });

  it('binds a scope inserted after start', async () => {
    const { root } = await mount(`<div></div>`, {
      scopes: { late: () => ({ msg: 'hi' }) },
    });
    root.insertAdjacentHTML(
      'beforeend',
      `<div data-rz-scope="late"><span data-rz-text="msg"></span></div>`,
    );
    await expect.poll(() => root.querySelector('span')?.textContent).toBe('hi');
  });

  it('leaves a region unbound when setup throws, and logs an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { $ } = await mount(
      `<div data-rz-scope="broken"><span data-rz-text="missing">static</span></div>`,
      {
        scopes: {
          broken: () => {
            throw new Error('boom');
          },
        },
      },
    );
    expect($('span').textContent).toBe('static');
    expect(error).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });
});
