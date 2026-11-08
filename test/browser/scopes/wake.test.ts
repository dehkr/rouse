import { describe, expect, it, vi } from 'vite-plus/test';
import { delay, HttpResponse, http, worker } from '../helpers/network';
import type { ScopeSetup } from '../../../src/types';
import { mount } from '../helpers/mount';

describe('rz-wake', () => {
  it('defers setup and binding until interaction', async () => {
    const setup = vi.fn(() => ({ msg: 'awake' }));
    const { $ } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="interact"><b data-rz-text="msg">static</b></section>`,
      { scopes: { lazy: setup } },
    );
    expect(setup).not.toHaveBeenCalled();
    expect($('b').textContent).toBe('static');

    $('b').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await expect.poll(() => $('b').textContent).toBe('awake');
    expect(setup).toHaveBeenCalledOnce();
  });

  it('wakes on focus as well as pointer interaction', async () => {
    const setup = vi.fn(() => ({}));
    const { $ } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="interact"><input></section>`,
      { scopes: { lazy: setup } },
    );
    $<HTMLInputElement>('input').focus();
    await expect.poll(() => setup.mock.calls.length).toBe(1);
  });

  it('waits for every listed trigger', async () => {
    const setup = vi.fn(() => ({}));
    const { $ } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="interact timeout-[30ms]"></section>`,
      { scopes: { lazy: setup } },
    );
    await delay(60);
    expect(setup).not.toHaveBeenCalled();

    $('section').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await expect.poll(() => setup.mock.calls.length).toBe(1);
  });

  it('fires the wake trigger on activation, not at page load', async () => {
    const requested = vi.fn();
    worker.use(
      http.get('/api/panel', () => {
        requested();
        return new HttpResponse('<p>panel</p>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }),
    );
    const { $ } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="interact">
        <div id="out" data-rz-fetch="wake: /api/panel"></div>
      </section>`,
      { scopes: { lazy: () => ({}) } },
    );
    await delay(30);
    expect(requested).not.toHaveBeenCalled();

    $('section').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await expect.poll(() => $('#out').innerHTML).toBe('<p>panel</p>');
    expect(requested).toHaveBeenCalledOnce();
  });

  it('never runs setup when the host leaves before waking', async () => {
    const setup = vi.fn(() => ({}));
    const { $ } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="timeout-[30ms]"></section>`,
      { scopes: { lazy: setup } },
    );
    $('section').remove();
    await delay(60);
    expect(setup).not.toHaveBeenCalled();
  });

  it('never runs setup when the app is destroyed before waking', async () => {
    const setup = vi.fn(() => ({}));
    const { app } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="timeout-[30ms]"></section>`,
      { scopes: { lazy: setup } },
    );
    app.destroy();
    await delay(60);
    expect(setup).not.toHaveBeenCalled();
  });

  it('runs setup once for a host moved before waking', async () => {
    const setup = vi.fn<ScopeSetup>(() => ({}));
    const { root, $ } = await mount(
      `<section data-rz-scope="lazy" data-rz-wake="timeout-[30ms]"></section><div></div>`,
      { scopes: { lazy: setup } },
    );
    $('div').append($('section'));
    await delay(80);
    expect(setup).toHaveBeenCalledOnce();
    expect(setup.mock.calls[0]![0].host.isConnected).toBe(true);
    expect(root.querySelector('div > section')).not.toBeNull();
  });
});
