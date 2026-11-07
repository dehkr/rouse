/*
 * Known bug: reordering mutators leave per-index signals stale, so `arr[i]` returns
 * the old value and an effect reading `arr[i]` doesn't re-run. The `.fails` tests
 * cover the bug; the plain tests cover behavior the fix must keep.
 * Brief: array-index-access.md
 */
import { effect } from 'alien-signals';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { reactive, trackDirty } from '../../../src/reactivity/reactive';

const stops: Array<() => void> = [];

function track(fn: () => unknown) {
  const runs = vi.fn();
  stops.push(
    effect(() => {
      runs();
      fn();
    }),
  );
  return runs;
}

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
});

type Mutation = (arr: number[]) => unknown;

// Each mutation changes the value at index 0 of [1, 2, 3]
const REORDERS: Array<[string, Mutation]> = [
  ['unshift', (a) => a.unshift(0)],
  ['shift', (a) => a.shift()],
  ['splice', (a) => a.splice(0, 1)],
  ['sort', (a) => a.sort((x, y) => y - x)],
  ['reverse', (a) => a.reverse()],
  ['copyWithin', (a) => a.copyWithin(0, 2)],
  ['fill', (a) => a.fill(9)],
];

const expectedFirst = (mutate: Mutation) => {
  const copy = [1, 2, 3];
  mutate(copy);
  return copy[0];
};

describe('array index access after a reorder', () => {
  it.fails.each(REORDERS)('returns the fresh value at an index after %s', (_, mutate) => {
    const list = reactive([1, 2, 3]);
    void list[0];
    mutate(list);
    expect(list[0]).toBe(expectedFirst(mutate));
  });

  it.fails.each(REORDERS)('re-runs an effect reading an index after %s', (_, mutate) => {
    const list = reactive([1, 2, 3]);
    const runs = track(() => list[0]);
    mutate(list);
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it.fails('returns the moved item’s cached proxy after a reorder', () => {
    const list = reactive([{ id: 1 }, { id: 2 }]);
    void list[0];
    const second = list[1];
    list.reverse();
    expect(list[0]).toBe(second);
  });

  it.fails('returns undefined past the end after a length truncation', () => {
    const list = reactive([1, 2, 3]);
    void list[2];
    list.length = 1;
    expect(list[2]).toBeUndefined();
  });

  it.fails('re-runs an `in` check on an index after a shift empties it', () => {
    const list = reactive([1]);
    const runs = track(() => 0 in list);
    list.shift();
    expect(runs).toHaveBeenCalledTimes(2);
  });
});

describe('array index behavior to keep', () => {
  it('returns the current value at an index never read before the mutation', () => {
    const list = reactive([1, 2, 3]);
    list.unshift(0);
    expect(list[0]).toBe(0);
  });

  it('notifies an index reader on a direct index write', () => {
    const list = reactive([1, 2, 3]);
    const runs = track(() => list[0]);
    list[0] = 10;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(list[0]).toBe(10);
  });

  it('keeps per-key reactivity for a custom property on an array', () => {
    const list = reactive(Object.assign([1], { label: 'a' }));
    const runs = track(() => list.label);
    list.label = 'b';
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('updates length and notifies a length reader on a reorder', () => {
    const list = reactive([1, 2, 3]);
    const runs = track(() => list.length);
    list.shift();
    expect(list.length).toBe(2);
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('truncates on a length write', () => {
    const list = reactive([1, 2, 3]);
    list.length = 1;
    expect([...list]).toEqual([1]);
  });

  it.each(REORDERS)('reads fresh through at() and iteration after %s', (_, mutate) => {
    const list = reactive([1, 2, 3]);
    void list.at(0);
    mutate(list);
    const copy = [1, 2, 3];
    mutate(copy);
    expect(list.at(0)).toBe(copy[0]);
    expect([...list]).toEqual(copy);
  });

  it('reports the root key to a dirty tracker on a reorder of a nested array', () => {
    const state = reactive({ items: [{ id: 1 }, { id: 2 }] });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    state.items.reverse();
    expect(dirty).toHaveBeenCalledWith('items');
  });

  it('reports the root key for an edit inside an item read by index', () => {
    const state = reactive({ items: [{ name: 'a' }] });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    const item = state.items[0] as { name: string };
    item.name = 'b';
    expect(dirty).toHaveBeenCalledWith('items');
  });
});
