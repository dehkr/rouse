import { describe, expect, it } from 'vite-plus/test';
import { reactive, type Selection, selection } from '../../../src/index';
import type { HandlerCtx } from '../../../src/types';
import { mount } from '../helpers/mount';

/** Whether each `li` in `root` has `className`. */
const marked = (root: Element, className: string) =>
  [...root.querySelectorAll('li')].map((li) => li.classList.contains(className));

describe('selection in markup', () => {
  it('marks the clicked item from a binding and a handler inside rz-render', async () => {
    const { root } = await mount(
      `<ul data-rz-scope="s">
        <template data-rz-render="items">
          <li data-rz-class="active: days.isSelected" data-rz-on="click: days.toggle"></li>
        </template>
      </ul>`,
      { scopes: { s: () => ({ items: ['a', 'b', 'c'], days: selection() }) } },
    );
    const li = (i: number) => root.querySelectorAll('li')[i]!;

    li(1).click();
    expect(marked(root, 'active')).toEqual([false, true, false]);
    li(2).click();
    expect(marked(root, 'active')).toEqual([false, false, true]);
    li(2).click();
    expect(marked(root, 'active')).toEqual([false, false, false]);
  });

  it('re-runs only the bindings whose item changes state', async () => {
    const days = selection();
    const runs = [0, 0, 0, 0];
    await mount(
      `<ul data-rz-scope="s">
        <template data-rz-render="items"><li data-rz-class="active: isActive"></li></template>
      </ul>`,
      {
        scopes: {
          s: () => ({
            items: [1, 2, 3, 4],
            isActive: (ctx: HandlerCtx) => {
              runs[ctx.render.index!]!++;
              return days.isSelected(ctx);
            },
          }),
        },
      },
    );

    days.set([1]);
    // Item 1 re-runs on deselect, item 2 on select; items 0 and 3 never re-run
    days.set([2]);
    expect(runs).toEqual([1, 3, 2, 1]);
  });

  it('follows the item across a reorder with key, and stays on the position without', async () => {
    const items = reactive([{ id: 1 }, { id: 2 }]);
    const byId = selection({ key: 'id' });
    const byPosition = selection();
    const { root } = await mount(
      `<ul data-rz-scope="s">
        <template data-rz-render="items" data-rz-key="id">
          <li data-rz-class="by-id: byId.isSelected, by-position: byPosition.isSelected"></li>
        </template>
      </ul>`,
      { scopes: { s: () => ({ items, byId, byPosition }) } },
    );
    byId.set([1]);
    byPosition.set([0]);
    expect(marked(root, 'by-id')).toEqual([true, false]);
    expect(marked(root, 'by-position')).toEqual([true, false]);

    items.reverse();
    expect(marked(root, 'by-id')).toEqual([false, true]);
    expect(marked(root, 'by-position')).toEqual([true, false]);
  });

  it('stops clearing on clearOn once its scope tears down', async () => {
    const source = reactive({ n: 0 });
    let days!: Selection<number>;
    let disconnected = false;
    const { $ } = await mount(`<section data-rz-scope="s"></section>`, {
      scopes: {
        s: () => {
          days = selection({ clearOn: () => source.n });
          return { days };
        },
      },
      setup: (a) => a.on('rz:scope:disconnect', () => (disconnected = true)),
    });

    days.set([0]);
    source.n++;
    expect(days.keys).toEqual([]);

    days.set([1]);
    $('section').remove();
    await expect.poll(() => disconnected).toBe(true);
    source.n++;
    expect(days.keys).toEqual([1]);
  });
});
