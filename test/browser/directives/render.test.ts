import { describe, expect, it } from 'vite-plus/test';
import { reactive } from '../../../src/index';
import { mount } from '../helpers/mount';

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
});
