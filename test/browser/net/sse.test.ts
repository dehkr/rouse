import { describe, expect, it, vi } from 'vite-plus/test';
import { delay, sse, worker } from '../helpers/network';
import { mount } from '../helpers/mount';

/** The part of MSW's stream client the tests use, open to any event name. */
interface Client {
  send(message: { event?: string; data: string }): void;
}

/** Mocks a stream at `path` and resolves each connection's client as it opens. */
function stream(path: string) {
  const clients: Client[] = [];
  worker.use(
    sse(path, ({ client }) => {
      // MSW types `send` per declared event name; the tests send arbitrary names
      clients.push(client as unknown as Client);
    }),
  );
  return {
    clients,
    /** Resolves once the first connection has opened. */
    open: async () => {
      await expect.poll(() => clients.length).toBeGreaterThan(0);
      // Let EventSource fire `open` and Rouse subscribe its named events
      await delay(10);
      return clients[0]!;
    },
  };
}

describe('rz-sse', () => {
  it('places unnamed HTML messages into the host by default', async () => {
    const s = stream('/api/events');
    const { $ } = await mount(`<div data-rz-sse="ready: /api/events"></div>`);
    (await s.open()).send({ data: '<b>one</b>' });
    await expect.poll(() => $('div').innerHTML).toBe('<b>one</b>');
  });

  it('deposits unnamed JSON messages into a store', async () => {
    const s = stream('/api/feed');
    const { $ } = await mount(`
      <script type="application/json" data-rz-store="feed"
        data-rz-sse="ready: /api/feed" data-rz-deposit="@feed">{ "n": 0, "title": "a" }</script>
      <b data-rz-text="@feed.n"></b>
    `);
    (await s.open()).send({ data: JSON.stringify({ n: 5 }) });
    await expect.poll(() => $('b').textContent).toBe('5');
  });

  it('delivers named events to sse-[name] on the stream or an ancestor, not beside it', async () => {
    const s = stream('/api/ticks');
    const ancestor = vi.fn();
    const beside = vi.fn();
    const besideRoot = vi.fn();
    await mount(
      `<div data-rz-scope="s">
        <article data-rz-on="sse-[tick]: ancestor">
          <section data-rz-sse="ready: /api/ticks" data-rz-place="null"></section>
        </article>
        <b data-rz-on="sse-[tick]: beside"></b>
        <u data-rz-on="sse-[tick]|root: besideRoot"></u>
      </div>`,
      { scopes: { s: () => ({ ancestor, beside, besideRoot }) } },
    );
    (await s.open()).send({ event: 'tick', data: '1' });

    await expect.poll(() => ancestor.mock.calls.length).toBe(1);
    expect(besideRoot).toHaveBeenCalledOnce();
    expect(beside).not.toHaveBeenCalled();
  });

  it('closes the stream on an rz-close trigger', async () => {
    const s = stream('/api/job');
    const reasons: unknown[] = [];
    const { $ } = await mount(
      `<div data-rz-sse="ready: /api/job" data-rz-close="sse-[done]"></div>`,
      { setup: (a) => a.on('rz:sse:close', (e) => reasons.push(e.detail.reason)) },
    );
    const client = await s.open();
    client.send({ event: 'done', data: '' });
    await expect.poll(() => reasons.length).toBe(1);

    client.send({ data: '<b>late</b>' });
    await delay(30);
    expect($('div').innerHTML).toBe('');
  });

  it('shares one connection between elements on the same URL', async () => {
    const s = stream('/api/shared');
    const { root } = await mount(`
      <div class="a" data-rz-sse="ready: /api/shared"></div>
      <div class="b" data-rz-sse="ready: /api/shared"></div>
    `);
    (await s.open()).send({ data: 'hi' });
    await expect
      .poll(() => [...root.querySelectorAll('div')].map((d) => d.textContent))
      .toEqual(['hi', 'hi']);
    expect(s.clients).toHaveLength(1);
  });

  it('closes with reason teardown from app.root when the host leaves the DOM', async () => {
    const s = stream('/api/live');
    const closes: CustomEvent[] = [];
    const { $, root } = await mount(`<div data-rz-sse="ready: /api/live"></div>`, {
      setup: (a) => a.on('rz:sse:close', (e) => closes.push(e)),
    });
    const host = $('div');
    await s.open();
    host.remove();
    await expect.poll(() => closes.map((e) => e.detail.reason)).toEqual(['teardown']);
    expect(closes[0]!.target).toBe(root);
    expect(closes[0]!.detail.config.triggerEl).toBe(host);
  });

  it('opens a stream from app.sse and stops on close', async () => {
    const s = stream('/api/prog');
    const messages: unknown[] = [];
    const { app } = await mount('', {
      setup: (a) => a.on('rz:sse:message', (e) => messages.push(e.detail.data)),
    });
    const close = app.sse('/api/prog');
    const client = await s.open();
    client.send({ data: JSON.stringify({ a: 1 }) });
    await expect.poll(() => messages).toEqual([{ a: 1 }]);

    close();
    client.send({ data: 'after' });
    await delay(30);
    expect(messages).toHaveLength(1);
  });
});
