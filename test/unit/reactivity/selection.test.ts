import { describe, expect, it, vi } from 'vite-plus/test';
import { effect, reactive, selection, signal } from '../../../src/index';
import type { HandlerCtx } from '../../../src/types';

/** A handler context for the item at `index`, as a binding inside `rz-render` gets. */
const at = (index: number | null, item: unknown = null): HandlerCtx<Element> => ({
  el: {} as Element,
  e: new Event('rz:class'),
  render: { item, index },
});

describe('selection', () => {
  it('selects one item at a time by default', () => {
    const s = selection();
    s.select(at(0));
    s.select(at(2));
    expect(s.keys).toEqual([2]);
    expect(s.isSelected(at(0))).toBe(false);
    expect(s.isSelected(at(2))).toBe(true);

    expect(s.toggle(at(2))).toBe(false);
    expect(s.keys).toEqual([]);
  });

  it('toggles items independently with multiple', () => {
    const s = selection({ multiple: true });
    expect(s.toggle(at(0))).toBe(true);
    expect(s.toggle(at(1))).toBe(true);
    s.deselect(at(0));
    expect(s.keys).toEqual([1]);
  });

  it('keys items by the field that key names', () => {
    const s = selection({ key: 'meta.id' });
    s.select(at(0, { meta: { id: 'b' } }));
    expect(s.keys).toEqual(['b']);
    expect(s.isSelected(at(5, { meta: { id: 'b' } }))).toBe(true);
  });

  it('warns and leaves an item without a key unselectable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const byId = selection({ key: 'id' });
    expect(byId.toggle(at(0, {}))).toBe(false);
    const byPosition = selection();
    expect(byPosition.toggle(at(null))).toBe(false);

    expect(byId.keys).toEqual([]);
    expect(byPosition.keys).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('replaces the selection from code, keeping the last key without multiple', () => {
    const single = selection<number>();
    single.set([1, 2, 3]);
    expect(single.keys).toEqual([3]);

    const many = selection<number>({ multiple: true });
    many.set(new Set([1, 2]));
    many.set([3, 3, 4]);
    expect(many.keys).toEqual([3, 4]);
    many.clear();
    expect(many.keys).toEqual([]);
  });

  it('works with methods detached from the selection', () => {
    const { toggle, isSelected, clear } = selection();
    toggle(at(1));
    expect(isSelected(at(1))).toBe(true);
    clear();
    expect(isSelected(at(1))).toBe(false);
  });

  it('stays unwrapped inside reactive state', () => {
    const s = selection();
    expect(reactive({ s }).s).toBe(s);
  });

  it('keeps its signal out of reach of a binding path', () => {
    expect('selected' in selection()).toBe(false);
  });

  it('re-runs only the effects whose item changed state', () => {
    const s = selection();
    const runs = [0, 0, 0, 0];
    runs.forEach((_, i) =>
      effect(() => {
        runs[i]!++;
        s.isSelected(at(i));
      }),
    );
    s.select(at(1));
    // Item 1 re-runs on deselect, item 2 on select; items 0 and 3 never re-run
    s.select(at(2));
    expect(runs).toEqual([1, 3, 2, 1]);
  });

  it('re-runs an effect that reads keys on every change', () => {
    const s = selection({ multiple: true });
    const seen: unknown[] = [];
    effect(() => {
      seen.push(s.keys);
    });
    s.select(at(0));
    s.select(at(1));
    expect(seen).toEqual([[], [0], [0, 1]]);
  });

  it('clears when the clearOn source changes, not on the first run', () => {
    const source = signal(1);
    const s = selection({ clearOn: source });
    s.select(at(0));
    expect(s.keys).toEqual([0]);

    source(2);
    expect(s.keys).toEqual([]);
  });
});
