import { describe, expect, it, vi } from 'vite-plus/test';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

describe('interceptors', () => {
  it('lets an async request interceptor add a header', async () => {
    let auth: string | null = null;
    worker.use(
      http.get('/api/me', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({});
      }),
    );
    const { app } = await mount('', {
      setup: (a) =>
        a.interceptor('request', async (config) => {
          await delay(5);
          config.headers = { ...config.headers, Authorization: 'Bearer t' };
        }),
    });
    await app.fetch('/api/me');
    expect(auth).toBe('Bearer t');
  });

  it('chains in registration order, each receiving the previous result', async () => {
    worker.use(http.get('/api/n', () => HttpResponse.json({ v: 1 })));
    const { app } = await mount('', {
      setup: (a) => {
        a.interceptor('response', (data) => ({ v: data.v + 1 }));
        a.interceptor('response', (data) => ({ v: data.v * 10 }));
      },
    });
    const { data } = await app.fetch('/api/n');
    expect(data).toEqual({ v: 20 });
  });

  it('unwraps an envelope before rz-deposit routes it', async () => {
    worker.use(
      http.get('/api/user', () => HttpResponse.json({ result: { name: 'Grace' } })),
    );
    const { app, $ } = await mount(
      `<button data-rz-fetch="click: /api/user" data-rz-deposit="@user">Load</button>`,
      {
        stores: { user: { name: 'Ada' } },
        setup: (a) => a.interceptor('response', (data) => data?.result ?? data),
      },
    );
    $('button').click();
    await expect.poll(() => app.stores.get('user')?.name).toBe('Grace');
    expect(app.stores.get('user')).not.toHaveProperty('result');
  });

  it('rewrites an error before any error event sees it', async () => {
    worker.use(http.get('/api/fail', () => new HttpResponse(null, { status: 503 })));
    const seen = vi.fn();
    const { app } = await mount('', {
      setup: (a) => {
        a.interceptor('error', (error) => ({ ...error, message: 'Try again later.' }));
        a.on('rz:fetch:error', (e) => seen(e.detail.error?.message));
      },
    });
    const { error } = await app.fetch('/api/fail');
    expect(error?.code).toBe(503);
    expect(error?.message).toBe('Try again later.');
    expect(seen).toHaveBeenCalledWith('Try again later.');
  });

  it('fails the request as NETWORK_ERROR when a request interceptor throws', async () => {
    const boom = new Error('no token');
    const { app } = await mount('', {
      setup: (a) =>
        a.interceptor('request', () => {
          throw boom;
        }),
    });
    // Never sent: an unmocked /api/ request would fail the test in afterEach.
    const { error } = await app.fetch('/api/never');
    expect(error?.code).toBe('NETWORK_ERROR');
    expect(error?.original).toBe(boom);
  });

  it('skips every phase with skipInterceptors', async () => {
    worker.use(http.get('/api/raw', () => HttpResponse.json({ v: 1 })));
    const request = vi.fn();
    const { app } = await mount('', {
      setup: (a) => {
        a.interceptor('request', request);
        a.interceptor('response', () => 'changed');
      },
    });
    const { data } = await app.fetch('/api/raw', { skipInterceptors: true });
    expect(request).not.toHaveBeenCalled();
    expect(data).toEqual({ v: 1 });
  });

  it('stops running after its teardown is called', async () => {
    worker.use(http.get('/api/x', () => HttpResponse.json({})));
    const request = vi.fn();
    let off: () => void = () => {};
    const { app } = await mount('', {
      setup: (a) => {
        off = a.interceptor('request', request);
      },
    });
    await app.fetch('/api/x');
    off();
    await app.fetch('/api/x');
    expect(request).toHaveBeenCalledOnce();
  });

  it('sees sync headers on a push config', async () => {
    worker.use(http.patch('/api/s', () => HttpResponse.json({})));
    const headers = vi.fn();
    const { app } = await mount('', {
      setup: (a) => {
        a.store('s', { v: 0 }, { url: '/api/s' });
        a.interceptor('request', (config) => {
          headers({ ...config.headers });
        });
      },
    });
    app.stores.get('s')!.v = 1;
    await app.stores.push('s');
    expect(headers).toHaveBeenCalledWith(
      expect.objectContaining({ 'Rouse-Sync': 'push', 'Rouse-Store': 's' }),
    );
  });
});
