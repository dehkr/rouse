import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { effect, reactive } from '../../../src/index';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount, nextMicrotask } from '../helpers/mount';
import { sync } from '../../../src/plugins/sync';

const stops: Array<() => void> = [];

/** Runs `fn` in an effect and returns a spy counting its re-runs. Stopped after each test. */
function track(fn: () => unknown) {
  const runs = vi.fn();
  stops.push(
    effect(() => {
      runs();
      fn();
    }),
  );
  runs.mockClear();
  return runs;
}

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  localStorage.clear();
  vi.restoreAllMocks();
});

const mountAbc = () =>
  mount('', {
    plugins: [sync],
    setup: (a) => a.store('abc', { a: 0, b: 0, c: 0 }, { url: '/api/abc' }),
  });

describe('store operations update bindings once', () => {
  it('deposit()', async () => {
    const { app } = await mountAbc();
    const s = app.stores.get('abc')!;
    const runs = track(() => s.a + s.b + s.c);

    app.stores.deposit('abc', { a: 1, b: 2, c: 3 });
    expect(runs).toHaveBeenCalledOnce();
  });

  it('revert() and update()', async () => {
    const { app } = await mountAbc();
    const s = app.stores.get('abc')!;
    const runs = track(() => s.a + s.b + s.c);

    s.a = 1;
    s.b = 1;
    s.c = 1;
    runs.mockClear();
    app.stores.revert('abc');
    expect(runs).toHaveBeenCalledOnce();

    runs.mockClear();
    app.stores.update('abc', { a: 7, b: 8, c: 9 });
    expect(runs).toHaveBeenCalledOnce();
  });

  it('a pull response', async () => {
    worker.use(http.get('/api/abc', () => HttpResponse.json({ a: 4, b: 5, c: 6 })));
    const { app } = await mountAbc();
    const s = app.stores.get('abc')!;
    const runs = track(() => s.a + s.b + s.c);

    await app.stores.pull('abc');
    expect(runs).toHaveBeenCalledOnce();
    expect(s.c).toBe(6);
  });

  it('saves a persisted store once per deposit', async () => {
    const { app } = await mount('', {
      setup: (a) =>
        a.store(
          'p',
          { a: 0, b: 0, c: 0 },
          { persist: 'local', persistKey: 'rouse-batch' },
        ),
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    app.stores.deposit('p', { a: 1, b: 2, c: 3 });
    await nextMicrotask();
    expect(setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem('rouse-batch')!)).toEqual({
      a: 1,
      b: 2,
      c: 3,
    });
  });
});

describe('synchronous DOM at user code boundaries', () => {
  it('shows an rz:store:patch listener the updated DOM', async () => {
    let text: string | null = null;
    const { app, $ } = await mount(`<span data-rz-text="@abc.a"></span>`, {
      setup: (a) => {
        a.store('abc', { a: 0, b: 0 });
        a.on('rz:store:patch', () => (text = $('span').textContent));
      },
    });

    app.stores.deposit('abc', { a: 1, b: 2 });
    expect(text).toBe('1');
  });

  it('lets a handler query an element rz-render added', async () => {
    let found: Element | null = null;
    const { $ } = await mount(
      `<div data-rz-scope="s">
        <template data-rz-render="state.editing"><input></template>
        <button data-rz-on="click: edit"></button>
      </div>`,
      {
        scopes: {
          s: ({ host }) => {
            const state = reactive({ editing: false });
            return {
              state,
              edit() {
                state.editing = true;
                found = host.querySelector('input');
              },
            };
          },
        },
      },
    );

    $('button').click();
    expect(found).not.toBeNull();
  });
});

describe('effects that write store data', () => {
  /** Keeps `items` sorted, as an app normalizing data would. */
  const sortItems = (s: { items: number[] }) =>
    track(() => {
      const sorted = [...s.items].sort((x, y) => x - y);
      if (sorted.some((v, i) => v !== s.items[i])) {
        s.items = sorted;
      }
    });

  it('mark the store dirty and fire edit when reacting to a deposit', async () => {
    const edits = vi.fn();
    const { app } = await mount('', {
      plugins: [sync],
      setup: (a) => {
        a.store('list', { items: [] as number[] });
        a.on({ edit: 'list' }, edits);
      },
    });
    const s = app.stores.get('list')!;
    sortItems(s);

    app.stores.deposit('list', { items: [3, 1, 2] });
    await delay(0);

    expect(s.items).toEqual([1, 2, 3]);
    expect(app.stores.isDirty('list')).toBe(true);
    expect(edits).toHaveBeenCalledOnce();
  });

  it('settle after one push when the server returns the normalized data', async () => {
    const bodies: unknown[] = [];
    worker.use(
      http.patch('/api/list', async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        return HttpResponse.json(body);
      }),
    );
    const { app } = await mount('', {
      plugins: [sync],
      setup: (a) => {
        a.store('list', { items: [] as number[] }, { url: '/api/list' });
        a.on({ edit: 'list' }, () => a.stores.push('list'));
      },
    });
    const s = app.stores.get('list')!;
    sortItems(s);

    app.stores.deposit('list', { items: [3, 1, 2] });
    await expect.poll(() => bodies.length).toBe(1);
    await delay(50);

    expect(bodies).toEqual([{ items: [1, 2, 3] }]);
    expect(app.stores.isDirty('list')).toBe(false);
  });
});
