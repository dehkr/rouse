import { describe, expect, it } from 'vite-plus/test';
import { delay, HttpResponse, http, sse, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

const html = (body: string) =>
  new HttpResponse(body, { headers: { 'Content-Type': 'text/html' } });

/** Records each of `events` heard on `target`, in order. */
function record(target: EventTarget, events: string[]) {
  const heard: CustomEvent[] = [];
  events.forEach((name) =>
    target.addEventListener(name, (e) => heard.push(e as CustomEvent)),
  );
  return heard;
}

const names = (heard: CustomEvent[]) => heard.map((e) => e.type);

const SCOPE_TEARDOWN = ['rz:scope:disconnect', 'rz:scope:destroy'];

// "Event origins": an event fires from the element it describes, or from `app.root`
// once that element has left the DOM, with `detail` naming the element.
describe('event origins for detached elements', () => {
  it('fires teardown events from the host on destroy(), while it is connected', async () => {
    worker.use(sse('/api/live', () => {}));
    const { app, $, root } = await mount(
      `<section data-rz-scope="s" data-rz-sse="ready: /api/live"></section>`,
      { scopes: { s: () => ({}) } },
    );
    const events = [...SCOPE_TEARDOWN, 'rz:sse:close'];
    const onHost = record($('section'), events);
    const onRoot = record(root, events);

    app.destroy();
    expect(names(onRoot)).toEqual(events);
    expect(names(onHost)).toEqual(events);
  });

  it('fires scope teardown events from app.root when the host is removed', async () => {
    const { $, root } = await mount(`<section data-rz-scope="s"></section>`, {
      scopes: { s: () => ({}) },
    });
    const host = $('section');
    const onRoot = record(root, SCOPE_TEARDOWN);

    host.remove();
    await expect.poll(() => names(onRoot)).toEqual(SCOPE_TEARDOWN);
    onRoot.forEach((e) => {
      expect(e.target).toBe(root);
      expect(e.detail.host).toBe(host);
    });
  });

  it('fires scope teardown events from app.root when an ancestor is removed', async () => {
    const { $, root } = await mount(
      `<div class="wrap"><section data-rz-scope="s"></section></div>`,
      { scopes: { s: () => ({}) } },
    );
    const host = $('section');
    const onWrap = record($('.wrap'), SCOPE_TEARDOWN);
    const onRoot = record(root, SCOPE_TEARDOWN);

    $('.wrap').remove();
    await expect.poll(() => names(onRoot)).toEqual(SCOPE_TEARDOWN);
    expect(onRoot[0]!.detail.host).toBe(host);
    expect(onWrap).toEqual([]);
  });

  it('fires rz:fetch:end from app.root when the trigger replaces itself', async () => {
    worker.use(http.get('/api/more', () => html('<p class="next">more</p>')));
    const { $, root } = await mount(
      `<button data-rz-fetch="click: /api/more" data-rz-place="outerHTML">More</button>`,
    );
    const trigger = $('button');
    const onRoot = record(root, ['rz:fetch:end']);

    trigger.click();
    await expect.poll(() => names(onRoot)).toEqual(['rz:fetch:end']);
    expect(root.querySelector('.next')).not.toBeNull();
    expect(onRoot[0]!.target).toBe(root);
    expect(onRoot[0]!.detail.config.triggerEl).toBe(trigger);
  });

  it('fires a request’s terminal events from app.root when its trigger is removed mid-flight', async () => {
    worker.use(
      http.get('/api/slow', async () => {
        await delay(30);
        return html('');
      }),
    );
    const { $, root } = await mount(
      `<button data-rz-fetch="click: /api/slow">Go</button>`,
    );
    const trigger = $('button');
    const events = ['rz:fetch:success', 'rz:fetch:end'];
    const onRoot = record(root, events);

    trigger.click();
    trigger.remove();
    await expect.poll(() => names(onRoot)).toEqual(events);
  });

  it('places the response of a trigger replaced while its request is in flight', async () => {
    worker.use(
      http.get('/api/partial', async () => {
        await delay(30);
        return html('<p>loaded</p>');
      }),
    );
    const { $ } = await mount(`
      <button data-rz-fetch="click: /api/partial" data-rz-place="#out">Load</button>
      <div id="out"></div>
    `);
    const trigger = $('button');
    const loading = document.createElement('span');
    loading.textContent = 'loading...';

    trigger.click();
    trigger.replaceWith(loading);
    await expect.poll(() => $('#out').innerHTML).toBe('<p>loaded</p>');
  });

  it('fires rz:store:patch from app.root once the store script is removed', async () => {
    const { app, $, root } = await mount(
      `<script type="application/json" data-rz-store="cart">{ "n": 0 }</script>`,
    );
    $('script').remove();
    await delay(0);

    let target: EventTarget | null = null;
    root.addEventListener('rz:store:patch', (e) => (target = e.target));
    app.stores.deposit('cart', { n: 1 });
    expect(target).toBe(root);
  });
});
