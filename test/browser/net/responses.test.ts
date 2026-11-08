import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { HttpResponse, http, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

const html = (body: string, headers: Record<string, string> = {}) =>
  new HttpResponse(body, { headers: { 'Content-Type': 'text/html', ...headers } });

describe('response headers', () => {
  it('dispatches a Rouse-Trigger event from the trigger after success', async () => {
    worker.use(
      http.post('/api/save', () => html('', { 'Rouse-Trigger': 'entry-added' })),
    );
    const order: string[] = [];
    const refresh = vi.fn(() => order.push('entry-added'));
    const { $ } = await mount(
      `<div data-rz-scope="s" data-rz-on="entry-added: refresh">
        <button data-rz-fetch="click: POST /api/save" data-rz-place="null">Save</button>
      </div>`,
      {
        scopes: { s: () => ({ refresh }) },
        setup: (a) => a.on('rz:fetch:success', () => order.push('success')),
      },
    );
    $('button').click();
    await expect.poll(() => refresh.mock.calls.length).toBe(1);
    expect(order).toEqual(['success', 'entry-added']);
  });

  it('routes an error body into a store with Rouse-Deposit', async () => {
    worker.use(
      http.post('/api/signup', () =>
        HttpResponse.json(
          { email: 'Enter a valid email address.' },
          { status: 422, headers: { 'Rouse-Deposit': '@errors' } },
        ),
      ),
    );
    const { $ } = await mount(`
      <script type="application/json" data-rz-store="errors">{}</script>
      <form action="/api/signup" method="post" data-rz-fetch="submit">
        <input name="email" data-rz-class="invalid: @errors.email">
        <p data-rz-text="@errors.email"></p>
        <button>Sign up</button>
      </form>
    `);
    $('button').click();
    await expect.poll(() => $('p').textContent).toBe('Enter a valid email address.');
    expect($('input').classList.contains('invalid')).toBe(true);
  });

  it('removes the trigger on an empty 204 with Rouse-Place: delete', async () => {
    worker.use(
      http.delete(
        '/api/item/1',
        () =>
          new HttpResponse(null, { status: 204, headers: { 'Rouse-Place': 'delete' } }),
      ),
    );
    const { root, $ } = await mount(
      `<ul><li data-rz-fetch="click: DELETE /api/item/1">one</li><li>two</li></ul>`,
    );
    $('li').click();
    await expect.poll(() => root.querySelectorAll('li').length).toBe(1);
    expect($('li').textContent).toBe('two');
  });

  describe('URL headers', () => {
    const start = location.href;
    afterEach(() => history.replaceState(history.state, '', start));

    it('replaces the URL with Rouse-Replace-Url', async () => {
      worker.use(
        http.get('/api/tab', () => html('tab', { 'Rouse-Replace-Url': '?tab=2' })),
      );
      const { $ } = await mount(`<button data-rz-fetch="click: /api/tab">Go</button>`);
      const length = history.length;
      $('button').click();
      await expect.poll(() => new URL(location.href).searchParams.get('tab')).toBe('2');
      expect(history.length).toBe(length);
    });

    it('ignores a cross-origin Rouse-Push-Url', async () => {
      worker.use(
        http.get('/api/tab', () =>
          html('tab', { 'Rouse-Push-Url': 'https://example.com/x' }),
        ),
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { $ } = await mount(`<button data-rz-fetch="click: /api/tab">Go</button>`);
      $('button').click();
      await expect.poll(() => $('button').textContent).toBe('tab');
      expect(location.href).toBe(start);
      warn.mockRestore();
    });
  });
});

describe('placement events', () => {
  it('cancels a placement from rz:dom:place:before', async () => {
    worker.use(http.get('/api/x', () => html('<b>new</b>')));
    const placed = vi.fn();
    const { $ } = await mount(`<button data-rz-fetch="click: /api/x">old</button>`, {
      setup: (a) => {
        a.on('rz:dom:place:before', (e) => e.preventDefault());
        a.on('rz:dom:place', placed);
      },
    });
    const success = new Promise((resolve) =>
      $('button').addEventListener('rz:fetch:end', resolve, { once: true }),
    );
    $('button').click();
    await success;
    expect($('button').textContent).toBe('old');
    expect(placed).not.toHaveBeenCalled();
  });

  it('places a rewritten payload', async () => {
    worker.use(http.get('/api/x', () => html('<b>new</b>')));
    const { $ } = await mount(`<button data-rz-fetch="click: /api/x">old</button>`, {
      setup: (a) =>
        a.on('rz:dom:place:before', (e) => {
          e.detail.payload = '<i>rewritten</i>';
        }),
    });
    $('button').click();
    await expect.poll(() => $('button').innerHTML).toBe('<i>rewritten</i>');
  });

  it('binds directives inside placed HTML', async () => {
    worker.use(
      http.get('/api/frag', () => html('<span data-rz-text="@user.name"></span>')),
    );
    const { app, $ } = await mount(
      `<button data-rz-fetch="click: /api/frag" data-rz-place="#out">Go</button><div id="out"></div>`,
      { stores: { user: { name: 'Ada' } } },
    );
    $('button').click();
    await expect.poll(() => $('#out span').textContent).toBe('Ada');
    app.stores.get('user')!.name = 'Grace';
    expect($('#out span').textContent).toBe('Grace');
  });
});
