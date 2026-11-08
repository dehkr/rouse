import { describe, expect, it } from 'vite-plus/test';
import { reactive } from '../../../src/index';
import { mount } from '../helpers/mount';

const texts = (root: Element, selector = 'li') =>
  [...root.querySelectorAll(selector)].map((el) => el.textContent);

describe('rz-render', () => {
  it('renders one instance per array item and follows mutations', async () => {
    const items = reactive([{ title: 'a' }, { title: 'b' }]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items"><li data-rz-text="%.title"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    expect(texts(root)).toEqual(['a', 'b']);

    items.push({ title: 'c' });
    items.shift();
    expect(texts(root)).toEqual(['b', 'c']);
  });

  it('keeps each keyed instance’s DOM node across a reorder', async () => {
    const items = reactive([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li data-rz-text="%.title"></li></template></ul>`,
      { scopes: { s: () => ({ items }) } },
    );
    const [first, second] = root.querySelectorAll('li');
    items.reverse();
    const [nowFirst, nowSecond] = root.querySelectorAll('li');
    expect(nowFirst).toBe(second);
    expect(nowSecond).toBe(first);
    expect(texts(root)).toEqual(['b', 'a']);
  });

  it('updates %::position after a reorder', async () => {
    const items = reactive([{ id: 'x' }, { id: 'y' }]);
    const { root } = await mount(
      `<ul data-rz-scope="s"><template data-rz-render="items" data-rz-key="id"><li><b data-rz-text="%::position"></b><i data-rz-text="%.id"></i></li></template></ul>`,
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

  it('reads an item by index from a store after a reorder', async () => {
    const { app, $ } = await mount(`<span data-rz-text="@list.items.0.name"></span>`, {
      stores: { list: { items: [{ name: 'a' }, { name: 'b' }] } },
    });
    app.stores.get('list')!.items.reverse();
    expect($('span').textContent).toBe('b');
  });
});
