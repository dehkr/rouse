import { describe, expect, it, vi } from 'vite-plus/test';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

const html = (body: string, headers: Record<string, string> = {}) =>
  new HttpResponse(body, { headers: { 'Content-Type': 'text/html', ...headers } });

describe('rz-fetch', () => {
  it('places an HTML response into the trigger by default', async () => {
    worker.use(http.get('/api/greeting', () => html('<b>hi</b>')));
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/greeting">Load</button>`,
    );
    $('button').click();
    await expect.poll(() => $('button').innerHTML).toBe('<b>hi</b>');
  });

  it('places into the rz-place target at the given position', async () => {
    worker.use(http.post('/api/log', () => html('<li>entry</li>')));
    const { $ } = await mount(`
      <button data-rz-fetch="click: POST /api/log" data-rz-place="beforeend: #log">Add</button>
      <ul id="log"><li>first</li></ul>
    `);
    $('button').click();
    await expect.poll(() => $('#log').children.length).toBe(2);
    expect($('#log').lastElementChild?.textContent).toBe('entry');
  });

  it('lets a Rouse-Place response header override rz-place', async () => {
    worker.use(
      http.get('/api/x', () => html('<i>from header</i>', { 'Rouse-Place': '#other' })),
    );
    const { $ } = await mount(`
      <button data-rz-fetch="click: /api/x" data-rz-place="#target">Go</button>
      <div id="target"></div><div id="other"></div>
    `);
    $('button').click();
    await expect.poll(() => $('#other').innerHTML).toBe('<i>from header</i>');
    expect($('#target').innerHTML).toBe('');
  });

  it('merges a JSON response into the rz-deposit store', async () => {
    worker.use(http.get('/api/user', () => HttpResponse.json({ name: 'Grace' })));
    const { app, $ } = await mount(
      `<button data-rz-fetch="click: /api/user" data-rz-deposit="@user">Load</button>`,
      { stores: { user: { name: 'Ada', role: 'admin' } } },
    );
    $('button').click();
    await expect.poll(() => app.stores.get('user')?.name).toBe('Grace');
    expect(app.stores.get('user')?.role).toBe('admin');
  });

  it('sends the Rouse-Request header and a field’s own name and value', async () => {
    let request: Request | undefined;
    worker.use(
      http.get('/api/search', ({ request: r }) => {
        request = r;
        return html('');
      }),
    );
    const { $ } = await mount(
      `<input name="q" value="rouse" data-rz-fetch="change: /api/search" data-rz-place="null">`,
    );
    $('input').dispatchEvent(new Event('change', { bubbles: true }));
    await expect.poll(() => request).toBeDefined();
    expect(request!.headers.get('Rouse-Request')).toBe('true');
    expect(new URL(request!.url).searchParams.get('q')).toBe('rouse');
  });

  it('fires request events in order: config, start, success, end', async () => {
    worker.use(http.get('/api/ok', () => html('ok')));
    const events: string[] = [];
    const { app, $ } = await mount(`<button data-rz-fetch="click: /api/ok">Go</button>`, {
      setup: (a) => {
        for (const phase of ['config', 'start', 'success', 'error', 'abort', 'end']) {
          a.on(`rz:fetch:${phase}`, () => events.push(phase));
        }
      },
    });
    $('button').click();
    await expect.poll(() => events.at(-1)).toBe('end');
    expect(events).toEqual(['config', 'start', 'success', 'end']);
    expect(app.root.contains($('button'))).toBe(true);
  });

  it('reports an error status through rz:fetch:error and leaves the DOM alone', async () => {
    worker.use(http.get('/api/fail', () => new HttpResponse('nope', { status: 500 })));
    const onError = vi.fn();
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/fail">Original</button>`,
      {
        setup: (a) => a.on('rz:fetch:error', (e) => onError(e.detail.error?.code)),
      },
    );
    $('button').click();
    await expect.poll(() => onError.mock.calls.length).toBe(1);
    expect(onError).toHaveBeenCalledWith(500);
    expect($('button').textContent).toBe('Original');
  });

  it('aborts an in-flight read when the same trigger fires again', async () => {
    let calls = 0;
    worker.use(
      http.get('/api/slow', async () => {
        calls++;
        await delay(calls === 1 ? 200 : 0);
        return html(`response ${calls}`);
      }),
    );
    const aborted = vi.fn();
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/slow" data-rz-place="#out">Go</button><div id="out"></div>`,
      { setup: (a) => a.on('rz:fetch:abort', aborted) },
    );
    $('button').click();
    $('button').click();
    await expect.poll(() => $('#out').textContent).toBe('response 2');
    expect(aborted).toHaveBeenCalledOnce();
  });

  it('drops a second write while the first is in flight', async () => {
    let calls = 0;
    worker.use(
      http.post('/api/save', async () => {
        calls++;
        await delay(100);
        return html('saved');
      }),
    );
    const ends = vi.fn();
    const { $ } = await mount(
      `<button data-rz-fetch="click: POST /api/save" data-rz-place="null">Save</button>`,
      { setup: (a) => a.on('rz:fetch:end', ends) },
    );
    $('button').click();
    $('button').click();
    await expect.poll(() => ends.mock.calls.length).toBe(1);
    expect(calls).toBe(1);
  });
});
