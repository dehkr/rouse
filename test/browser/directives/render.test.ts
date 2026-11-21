import { describe, expect, it, vi } from 'vite-plus/test';
import { batch, reactive } from '../../../src/index';
import { mount, nextMicrotask } from '../helpers/mount';
import { delay, HttpResponse, http, worker } from '../helpers/network';

const texts = (root: Element, selector = 'li') =>
  [...root.querySelectorAll(selector)].map((el) => el.textContent);

describe('rz-render', () => {
  it('renders one instance per array item and follows mutations', async () => {
    const items = reactive([{ title: 'a' }, { title: 'b' }]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items"><li data-rz-text="~item.title"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    expect(texts(root)).toEqual(['a', 'b']);

    items.push({ title: 'c' });
    items.shift();
    expect(texts(root)).toEqual(['b', 'c']);

    items[0] = { title: 'd' };
    expect(texts(root)).toEqual(['d', 'c']);
  });

  it('keeps each keyed instance’s DOM node across a reorder', async () => {
    const items = reactive([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li data-rz-text="~item.title"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    const [first, second] = root.querySelectorAll('li');
    items.reverse();
    const [nowFirst, nowSecond] = root.querySelectorAll('li');
    expect(nowFirst).toBe(second);
    expect(nowSecond).toBe(first);
    expect(texts(root)).toEqual(['b', 'a']);
  });

  it('tracks only the source, not the key fields it reads while reconciling', async () => {
    const items = reactive([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li data-rz-text="~item.id"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    const [first] = root.querySelectorAll('li');
    items[0]!.id = 3;
    expect(root.querySelector('li')).toBe(first);
    expect(texts(root)).toEqual(['3', '2']);
  });

  it('updates ~item::position after a reorder', async () => {
    const items = reactive([{ id: 'x' }, { id: 'y' }]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li><b data-rz-text="~item::position"></b><i data-rz-text="~item.id"></i></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    items.reverse();
    expect(texts(root, 'li')).toEqual(['1y', '2x']);
  });

  it('renders n copies in number mode and toggles in boolean mode', async () => {
    const state = reactive({ n: 2, show: false });
    const { root } = await mount(
      `<div data-rz-scope="s">
        <template data-rz-render="n"><i></i></template>
        <template data-rz-render="show"><p>shown</p></template>
      </div>`,
      { scopes: { s: () => state } },
    );
    expect(root.querySelectorAll('i')).toHaveLength(2);
    expect(root.querySelector('p')).toBeNull();

    state.n = 0;
    state.show = true;
    expect(root.querySelectorAll('i')).toHaveLength(0);
    expect(root.querySelector('p')?.textContent).toBe('shown');
  });

  it('calls an item function in a binding with this as the item', async () => {
    const { root } = await mount(
      `<ul><template data-rz-render="@people.list"><li data-rz-text="~item.label"></li></template></ul>`,
      {
        stores: {
          people: {
            list: [
              {
                name: 'Ada',
                label(this: { name: string }) {
                  return this.name.toUpperCase();
                },
              },
            ],
          },
        },
      },
    );
    expect(texts(root)).toEqual(['ADA']);
  });

  it('reads an item by index from a store after a reorder', async () => {
    const { app, $ } = await mount(`<span data-rz-text="@list.items.0.name"></span>`, {
      stores: { list: { items: [{ name: 'a' }, { name: 'b' }] } },
    });
    app.stores.get('list')!.items.reverse();
    expect($('span').textContent).toBe('b');
  });

  it('keeps nested scopes and standalone directives in a keyed instance across a reorder', async () => {
    const requested = vi.fn();
    worker.use(
      http.get('/api/row', () => {
        requested();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const setup = vi.fn(() => ({}));
    const items = reactive([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id">
        <li><section data-rz-scope="row" data-rz-fetch="ready: /api/row" data-rz-place="null"></section></li>
      </template></ul>`,
      { scopes: { s: () => ({ items }), row: setup } },
    );
    await expect.poll(() => requested).toHaveBeenCalledTimes(4);
    expect(setup).toHaveBeenCalledTimes(4);

    items.reverse();
    await delay(30);
    expect(setup).toHaveBeenCalledTimes(4);
    expect(requested).toHaveBeenCalledTimes(4);
  });

  it('never runs setup for a waiting scope in an instance moved, then removed', async () => {
    const setup = vi.fn(() => ({}));
    const items = reactive([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id">
        <li><section data-rz-scope="lazy" data-rz-wake="timeout-[30ms]"></section></li>
      </template></ul>`,
      { scopes: { s: () => ({ items }), lazy: setup } },
    );
    items.reverse();
    await nextMicrotask();
    items.length = 0;
    await delay(60);
    expect(setup).not.toHaveBeenCalled();
  });

  it('removes a keyed instance without moving the instances after it', async () => {
    const items = reactive([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    const { $ } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li data-rz-text="~item.id"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    const observer = new MutationObserver(() => {});
    observer.observe($('ul'), { childList: true });
    items.shift();
    const records = observer.takeRecords();
    observer.disconnect();

    const elements = (nodes: NodeList[]) =>
      nodes.flatMap((list) => [...list]).filter((n) => n.nodeType === Node.ELEMENT_NODE);
    expect(elements(records.map((r) => r.removedNodes))).toHaveLength(1);
    expect(elements(records.map((r) => r.addedNodes))).toHaveLength(0);
  });

  it('tears down a scope binding inserted into an instance when the instance is removed', async () => {
    const state = reactive({ items: [{ id: 1 }], label: 'a' });
    const { $ } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li></li></template></ul>`,
      { scopes: { s: () => state } },
    );
    const b = document.createElement('b');
    b.setAttribute('data-rz-text', 'label');
    $('li').append(b);
    await nextMicrotask();
    expect(b.textContent).toBe('a');

    state.items.length = 0;
    await nextMicrotask();
    state.label = 'b';
    expect(b.textContent).toBe('a');
  });

  it('tears down a global binding inserted into an instance when the instance is removed', async () => {
    const { app, $ } = await mount(
      `<ul><template data-rz-render="@list.items" data-rz-key="id"><li></li></template></ul>`,
      { stores: { list: { items: [{ id: 1 }], label: 'a' } } },
    );
    const b = document.createElement('b');
    b.setAttribute('data-rz-text', '@list.label');
    $('li').append(b);
    await nextMicrotask();
    expect(b.textContent).toBe('a');

    const list = app.stores.get('list')!;
    list.items.length = 0;
    await nextMicrotask();
    list.label = 'b';
    expect(b.textContent).toBe('a');
  });

  it('keeps a keyed instance’s DOM node when batch() moves its item', async () => {
    const items = reactive([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li data-rz-text="~item.id"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    const first = root.querySelector('li');
    batch(() => items.push(items.shift()!));
    expect(texts(root)).toEqual(['2', '3', '1']);
    expect(root.querySelectorAll('li')[2]).toBe(first);
  });
});
