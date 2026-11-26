import { describe, expect, it, vi } from 'vite-plus/test';
import { sync } from '../../../src/plugins/sync';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import { mount, nextMicrotask } from '../helpers/mount';

const HINT = 'needs the sync plugin. Install it with rouse({ plugins: [sync] }).';

describe('stores without the sync plugin', () => {
  it('merge a fetch response routed by rz-deposit and fire the patch events', async () => {
    worker.use(http.get('/api/user', () => HttpResponse.json({ name: 'Ada' })));
    const events: string[] = [];
    const { $ } = await mount(
      `<button data-rz-fetch="click: /api/user" data-rz-deposit="@user">Load</button>
       <span data-rz-text="@user.name"></span>`,
      {
        setup: (a) => {
          a.store('user', { name: '', role: 'admin' });
          a.on('rz:store:patch:before', () => events.push('before'));
          a.on('rz:store:patch', () => events.push('patch'));
        },
      },
    );

    $('button').click();

    await expect.poll(() => $('span').textContent).toBe('Ada');
    expect(events).toEqual(['before', 'patch']);
  });

  it('fire edit on user writes, not on deposits', async () => {
    const edits = vi.fn();
    const { app } = await mount('', {
      setup: (a) => {
        a.store('s', { v: 0 });
        a.on({ edit: 's' }, edits);
      },
    });

    app.stores.deposit('s', { v: 1 });
    await nextMicrotask();
    expect(edits).not.toHaveBeenCalled();

    app.stores.get('s')!.v = 2;
    await nextMicrotask();
    expect(edits).toHaveBeenCalledOnce();
  });

  it('warn for rz-push and rz-pull, and send nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // An unmocked request under /api/ fails the test, so this also proves no request
    const { $ } = await mount(
      `<button id="push" data-rz-push="click: @s"></button>
       <button id="pull" data-rz-pull="click: @s"></button>`,
      { setup: (a) => a.store('s', { v: 0 }) },
    );

    $('#push').click();
    $('#pull').click();
    await delay(20);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(`[Rouse] rz-push: ${HINT}`, $('#push'));
    expect(warn).toHaveBeenCalledWith(`[Rouse] rz-pull: ${HINT}`, $('#pull'));
  });

  it('warn once for @store::status, which reads undefined', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app, $ } = await mount(
      `<span data-rz-text="@s::status.dirty"></span>
       <i data-rz-text="@s::status.syncing"></i>`,
      { setup: (a) => a.store('s', { v: 0 }) },
    );

    app.stores.get('s')!.v = 1;
    await delay(0);

    expect($('span').textContent).toBe('');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(`[Rouse] '@s::status' ${HINT}`);
  });

  it('warn for each sync option passed to a store', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = await mount('');

    app.store('s', { v: 0 }, { url: '/api/s', timeout: 100 });

    expect(app.stores.has('s')).toBe(true);
    expect(warn).toHaveBeenCalledWith(`[Rouse] Store 's': 'url' ${HINT}`);
    expect(warn).toHaveBeenCalledWith(`[Rouse] Store 's': 'timeout' ${HINT}`);
  });

  it('throw an install hint from the sync methods', async () => {
    const { app } = await mount('', { stores: { s: { v: 0 } } });

    expect(() => app.stores.push('s')).toThrow(`[Rouse] app.stores.push() ${HINT}`);
    expect(() => app.stores.isDirty('s')).toThrow(`[Rouse] app.stores.isDirty() ${HINT}`);
  });

  it('sync only in the app that installed the plugin', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const markup = `<span data-rz-text="@s::status.dirty"></span>`;
    const withSync = await mount(markup, { plugins: [sync], stores: { s: { v: 0 } } });
    const without = await mount(markup, { stores: { s: { v: 0 } } });

    withSync.app.stores.get('s')!.v = 1;
    without.app.stores.get('s')!.v = 1;
    await delay(0);

    expect(withSync.$('span').textContent).toBe('true');
    expect(without.$('span').textContent).toBe('');
    expect(warn).toHaveBeenCalledOnce();
  });
});
