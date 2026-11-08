import { describe, expect, it, vi } from 'vite-plus/test';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

describe('store push', () => {
  it('sends the whole store as a merge-patch PATCH with sync headers', async () => {
    let request: Request | undefined;
    let body: unknown;
    worker.use(
      http.patch('/api/cart', async ({ request: r }) => {
        request = r;
        body = await r.json();
        return HttpResponse.json({});
      }),
    );
    const { app } = await mount('', {
      setup: (a) =>
        a.store('cart', { items: [] as number[], note: '' }, { url: '/api/cart' }),
    });
    app.stores.get('cart')!.items.push(1);
    await app.stores.push('cart');

    expect(request!.headers.get('Content-Type')).toBe('application/merge-patch+json');
    expect(request!.headers.get('Rouse-Sync')).toBe('push');
    expect(request!.headers.get('Rouse-Store')).toBe('cart');
    expect(body).toEqual({ items: [1], note: '' });
    expect(app.stores.isDirty('cart')).toBe(false);
  });

  it('keeps data and dirty state on failure and sets status.error', async () => {
    worker.use(http.patch('/api/cart', () => new HttpResponse(null, { status: 500 })));
    const { app } = await mount('', {
      setup: (a) => a.store('cart', { count: 0 }, { url: '/api/cart' }),
    });
    const cart = app.stores.get('cart')!;
    cart.count = 5;
    await app.stores.push('cart');

    expect(cart.count).toBe(5);
    expect(app.stores.isDirty('cart')).toBe(true);
    expect(app.stores.status('cart')!.error?.code).toBe(500);

    expect(app.stores.revert('cart')).toBe(true);
    expect(cart.count).toBe(0);
  });

  it('holds a push made during another and sends one follow-up', async () => {
    const bodies: unknown[] = [];
    worker.use(
      http.patch('/api/n', async ({ request }) => {
        bodies.push(await request.json());
        await delay(50);
        return HttpResponse.json({});
      }),
    );
    const { app } = await mount('', {
      setup: (a) => a.store('n', { v: 0 }, { url: '/api/n' }),
    });
    const n = app.stores.get('n')!;
    n.v = 1;
    const first = app.stores.push('n');
    n.v = 2;
    void app.stores.push('n');
    n.v = 3;
    void app.stores.push('n');
    await first;
    await expect.poll(() => bodies.length).toBe(2);
    await delay(100);
    expect(bodies).toEqual([{ v: 1 }, { v: 3 }]);
  });

  it('autosaves on edit through a declarative store', async () => {
    const save = vi.fn();
    worker.use(
      http.patch('/api/user', async ({ request }) => {
        save(await request.json());
        return HttpResponse.json({});
      }),
    );
    const { app, $ } = await mount(`
      <script type="application/json" data-rz-store="user: /api/user"
        data-rz-push="edit-[@user]|debounce-[20ms]: @user">{ "name": "Ada" }</script>
      <input data-rz-model="@user.name">
    `);
    const input = $<HTMLInputElement>('input');
    expect(input.value).toBe('Ada');
    for (const value of ['G', 'Gr', 'Grace']) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await expect.poll(() => save.mock.calls.length).toBe(1);
    expect(save).toHaveBeenCalledWith({ name: 'Grace' });
    await expect.poll(() => app.stores.isDirty('user')).toBe(false);
  });

  it('does not push for framework writes', async () => {
    const { app } = await mount(
      `<script type="application/json" data-rz-store="user: /api/user"
        data-rz-push="edit-[@user]: @user">{ "name": "Ada" }</script>`,
    );
    app.stores.deposit('user', { name: 'Grace' });
    app.stores.update('user', { name: 'Linus' });
    await delay(50);
    // An unmocked PATCH would fail the test in afterEach.
    expect(app.stores.get('user')!.name).toBe('Linus');
  });
});

describe('store pull', () => {
  it('merges the response as JSON Merge Patch and reads clean', async () => {
    let sync: string | null = null;
    worker.use(
      http.get('/api/profile', ({ request }) => {
        sync = request.headers.get('Rouse-Sync');
        return HttpResponse.json({ name: 'Grace', bio: null, tags: ['x'] });
      }),
    );
    const { app } = await mount('', {
      setup: (a) =>
        a.store(
          'profile',
          { name: 'Ada', bio: 'old', tags: ['a', 'b'], role: 'admin' },
          { url: '/api/profile' },
        ),
    });
    await app.stores.pull('profile');

    const merged = { name: 'Grace', tags: ['x'], role: 'admin' };
    expect(sync).toBe('pull');
    expect(app.stores.snapshot('profile')).toEqual(merged);
    expect(app.stores.baseline('profile')).toEqual(merged);
    expect(app.stores.isDirty('profile', 'name')).toBe(false);
    expect(app.stores.status('profile')!.lastSync).toBeGreaterThan(0);
  });

  it('reads clean after the server deletes a root with null', async () => {
    worker.use(http.get('/api/profile', () => HttpResponse.json({ bio: null })));
    const { app } = await mount('', {
      setup: (a) =>
        a.store('profile', { name: 'Ada', bio: 'old' }, { url: '/api/profile' }),
    });
    await app.stores.pull('profile');

    expect(app.stores.snapshot('profile')).toEqual({ name: 'Ada' });
    expect(app.stores.dirtyRoots('profile')).toEqual([]);
  });

  it('pulls on ready from markup and updates bindings', async () => {
    worker.use(http.get('/api/feed', () => HttpResponse.json({ title: 'fresh' })));
    const { $ } = await mount(`
      <script type="application/json" data-rz-store="feed: /api/feed"
        data-rz-pull="ready: @feed">{ "title": "stale" }</script>
      <h1 data-rz-text="@feed.title"></h1>
    `);
    await expect.poll(() => $('h1').textContent).toBe('fresh');
  });

  it('skips the response when the user edits during the pull', async () => {
    worker.use(
      http.get('/api/doc', async () => {
        await delay(50);
        return HttpResponse.json({ text: 'server' });
      }),
    );
    const skipped = vi.fn();
    const { app } = await mount('', {
      setup: (a) => {
        a.store('doc', { text: 'initial' }, { url: '/api/doc' });
        a.on('rz:store:patch:skipped', skipped);
      },
    });
    const pending = app.stores.pull('doc');
    app.stores.get('doc')!.text = 'mine';
    await pending;

    expect(app.stores.get('doc')!.text).toBe('mine');
    expect(skipped).toHaveBeenCalledOnce();
  });
});

describe('store status and dirty tracking', () => {
  it('reports dirty roots a microtask after an edit', async () => {
    const { app } = await mount('', { stores: { s: { a: 1, b: { c: 2 } } } });
    const s = app.stores.get('s')!;
    s.b.c = 3;
    await Promise.resolve();
    expect(app.stores.isDirty('s')).toBe(true);
    expect(app.stores.dirtyRoots('s')).toEqual(['b']);
    expect(app.stores.isDirty('s', 'a')).toBe(false);

    s.b.c = 2;
    await Promise.resolve();
    expect(app.stores.isDirty('s')).toBe(false);
  });

  it('binds status fields in markup', async () => {
    worker.use(
      http.patch('/api/s', async () => {
        await delay(50);
        return HttpResponse.json({});
      }),
    );
    const { app, $ } = await mount(
      `<button data-rz-attr="disabled: @s::status.syncing"></button>
       <span data-rz-class="unsaved: @s::status.dirty"></span>`,
      { setup: (a) => a.store('s', { v: 0 }, { url: '/api/s' }) },
    );
    app.stores.get('s')!.v = 1;
    await expect.poll(() => $('span').classList.contains('unsaved')).toBe(true);

    const pushed = app.stores.push('s');
    await expect.poll(() => $('button').hasAttribute('disabled')).toBe(true);
    await pushed;
    expect($('button').hasAttribute('disabled')).toBe(false);
    expect($('span').classList.contains('unsaved')).toBe(false);
  });

  it('re-seeds a declarative store when its script is replaced', async () => {
    const { app, root, $ } = await mount(`
      <script type="application/json" data-rz-store="cart">{ "n": 1 }</script>
      <b data-rz-text="@cart.n"></b>
    `);
    app.stores.get('cart')!.n = 9;
    $('script').remove();
    root.insertAdjacentHTML(
      'afterbegin',
      `<script type="application/json" data-rz-store="cart">{ "n": 2 }</script>`,
    );
    await expect.poll(() => $('b').textContent).toBe('2');
    expect(app.stores.isDirty('cart')).toBe(false);
  });
});
