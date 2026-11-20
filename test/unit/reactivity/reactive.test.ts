import { effect } from 'alien-signals';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  getRaw,
  reactive,
  trackDirty,
  untracked,
} from '../../../src/reactivity/reactive';

const stops: Array<() => void> = [];

/** Runs `fn` in an effect and returns a spy counting its runs. Stopped after each test. */
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

describe('reactive', () => {
  it('returns one proxy per object, and a proxy unchanged', () => {
    const raw = { a: 1 };
    const proxy = reactive(raw);
    expect(proxy).not.toBe(raw);
    expect(reactive(raw)).toBe(proxy);
    expect(reactive(proxy)).toBe(proxy);
    expect(getRaw(proxy)).toBe(raw);
  });

  it('returns built-ins unproxied', () => {
    for (const value of [new Map(), new Set(), new Date()]) {
      expect(reactive(value)).toBe(value);
    }
  });

  it('returns class instances unproxied', () => {
    class Counter {
      #n = 0;
      inc() {
        return ++this.#n;
      }
    }
    const state = reactive({ counter: new Counter() });
    expect(state.counter.inc()).toBe(1);
  });

  it('returns a nested class instance as the same raw instance', () => {
    class Thing {}
    const thing = new Thing();
    const state = reactive({ nested: { thing } });
    expect(state.nested.thing).toBe(thing);
    expect(reactive(thing)).toBe(thing);
  });

  it('proxies objects with a null prototype', () => {
    const raw = Object.create(null) as { a?: number };
    raw.a = 1;
    const proxy = reactive(raw);
    expect(proxy).not.toBe(raw);
    expect(getRaw(proxy)).toBe(raw);
    const runs = track(() => proxy.a);
    proxy.a = 2;
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('proxies nested objects lazily, on read', () => {
    const raw = { inner: { x: 1 } };
    const state = reactive(raw);
    expect(getRaw(state.inner)).toBe(raw.inner);
    expect(state.inner).not.toBe(raw.inner);
  });
});

describe('tracking', () => {
  it('re-runs an effect when a key it read changes', () => {
    const state = reactive({ a: 1, b: 1 });
    const runs = track(() => state.a);
    state.a = 2;
    state.b = 2;
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('ignores a write of the value a key already holds', () => {
    const state = reactive({ a: 1 });
    const runs = track(() => state.a);
    state.a = 1;
    expect(runs).toHaveBeenCalledOnce();
  });

  it('tracks nested reads', () => {
    const state = reactive({ user: { name: 'A' } });
    const runs = track(() => state.user.name);
    state.user.name = 'B';
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('stores the raw object when a proxy is assigned', () => {
    const inner = reactive({ x: 1 });
    const state = reactive<{ inner?: { x: number } }>({});
    state.inner = inner;
    expect(getRaw(state).inner).toBe(getRaw(inner));
  });

  it('re-runs key enumeration on an added or deleted key', () => {
    const state = reactive<Record<string, number>>({ a: 1 });
    const runs = track(() => Object.keys(state));
    state.b = 2;
    delete state.a;
    expect(runs).toHaveBeenCalledTimes(3);
  });

  it('re-runs an `in` check when the key is added later', () => {
    const state = reactive<Record<string, number>>({});
    let present = false;
    const runs = track(() => {
      present = 'late' in state;
    });
    state.late = 1;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(present).toBe(true);
  });

  it('does not subscribe an effect to a key it writes', () => {
    const state = reactive({ a: 1, b: 0 });
    const runs = track(() => {
      state.b = state.a + 1;
    });
    state.b = 100;
    expect(runs).toHaveBeenCalledOnce();
    state.a = 5;
    expect(state.b).toBe(6);
  });
});

describe('accessors', () => {
  it('caches a getter as a computed with the proxy as `this`', () => {
    const getter = vi.fn(function (this: { a: number }) {
      return this.a * 2;
    });
    const state = reactive({
      a: 1,
      get double() {
        return getter.call(this);
      },
    });
    expect(state.double).toBe(2);
    expect(state.double).toBe(2);
    expect(getter).toHaveBeenCalledOnce();
    state.a = 5;
    expect(state.double).toBe(10);
  });

  it('re-runs an effect reading a getter when its dependency changes', () => {
    const state = reactive({
      a: 1,
      get double() {
        return this.a * 2;
      },
    });
    const runs = track(() => state.double);
    state.a = 2;
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('writes through a setter', () => {
    const state = reactive({
      _v: 1,
      get v() {
        return this._v;
      },
      set v(next: number) {
        this._v = next * 10;
      },
    });
    state.v = 2;
    expect(state._v).toBe(20);
  });
});

describe('arrays', () => {
  it('notifies once per mutator call', () => {
    const list = reactive([1, 2, 3]);
    const runs = track(() => list.length);
    list.push(4, 5);
    list.splice(0, 2);
    expect(runs).toHaveBeenCalledTimes(3);
  });

  it.each<[string, (list: number[]) => unknown]>([
    ['sort', (list) => list.sort((a, b) => a - b)],
    ['reverse', (list) => list.reverse()],
    ['fill', (list) => list.fill(0)],
    ['copyWithin', (list) => list.copyWithin(0, 1)],
  ])('returns the proxy from %s', (_, mutate) => {
    const list = reactive([2, 1]);
    expect(mutate(list)).toBe(list);
  });

  it('re-runs an effect on a write chained on a mutator', () => {
    const list = reactive([2, 1]);
    const runs = track(() => list.length);
    list.sort((a, b) => a - b).push(3);
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('re-runs an effect iterating the array on index writes', () => {
    const list = reactive([1, 2]);
    let sum = 0;
    const runs = track(() => {
      sum = 0;
      for (const n of list) sum += n;
    });
    list[0] = 10;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(sum).toBe(12);
  });

  it('passes reactive items to callbacks', () => {
    const list = reactive([{ done: false }]);
    const runs = track(() => list.map((item) => item.done));
    list.forEach((item) => {
      item.done = true;
    });
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('wraps the items of a new array a producer returns', () => {
    const list = reactive([{ x: 1 }]);
    const [first] = list.filter(() => true);
    expect(getRaw(first)).not.toBe(first);
  });

  it('finds an item whether searched by proxy or raw object', () => {
    const rawItem = { id: 1 };
    const list = reactive([rawItem]);
    const proxyItem = list[0] as typeof rawItem;
    expect(list.includes(proxyItem)).toBe(true);
    expect(list.includes(rawItem)).toBe(true);
    expect(list.indexOf(proxyItem)).toBe(0);
  });

  it('keeps a function passed to concat as data', () => {
    const fn = () => 1;
    const list = reactive<unknown[]>([]);
    expect(list.concat(fn)[0]).toBe(fn);
  });
});

describe('trackDirty', () => {
  it('reports the root key for top-level and nested writes', () => {
    const state = reactive({ a: 1, user: { name: 'A' } });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    state.a = 2;
    state.user.name = 'B';
    expect(dirty.mock.calls).toEqual([['a'], ['user']]);
  });

  it('reports the root key for an array mutation and a delete', () => {
    const state = reactive<{ items: number[]; gone?: number }>({ items: [], gone: 1 });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    state.items.push(1);
    delete state.gone;
    expect(dirty.mock.calls).toEqual([['items'], ['gone']]);
  });

  it('reports nothing for a write of the same value', () => {
    const state = reactive({ a: 1 });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    state.a = 1;
    expect(dirty).not.toHaveBeenCalled();
  });

  // `rz-render` reaches items through `map()`, without the get trap
  it('reports the root key for an edit inside an item from map()', () => {
    const state = reactive({ items: [{ name: 'a' }] });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    const item = state.items.map((entry) => entry)[0] as { name: string };
    item.name = 'b';
    expect(dirty).toHaveBeenCalledWith('items');
  });

  it.each<[string, (items: Array<{ name: string }>, item: { name: string }) => unknown]>([
    ['push', (items, item) => items.push(item)],
    ['unshift', (items, item) => items.unshift(item)],
    ['splice', (items, item) => items.splice(0, 0, item)],
  ])('reports the root key for an edit inside an item inserted by %s', (_, insert) => {
    const state = reactive({ items: [] as Array<{ name: string }> });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    insert(state.items, { name: 'a' });
    dirty.mockClear();
    const item = state.items.find((entry) => entry.name === 'a') as { name: string };
    item.name = 'b';
    expect(dirty).toHaveBeenCalledWith('items');
  });

  it('reports the root key for an edit inside an item of a nested array', () => {
    const state = reactive({ grid: [[{ on: false }]] });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    for (const row of state.grid) {
      for (const cell of row) cell.on = true;
    }
    expect(dirty).toHaveBeenCalledWith('grid');
  });

  it('reports nothing for an edit inside an object a map() callback creates', () => {
    const state = reactive({ items: [{ name: 'a' }] });
    const dirty = vi.fn();
    trackDirty(state, dirty);
    const copy = state.items.map((entry) => ({ name: entry.name }))[0] as {
      name: string;
    };
    copy.name = 'b';
    expect(dirty).not.toHaveBeenCalled();
  });
});

describe('untracked', () => {
  it('reads without subscribing the surrounding effect', () => {
    const state = reactive({ a: 1, b: 1 });
    const runs = track(() => {
      void state.a;
      untracked(() => state.b);
    });
    state.b = 2;
    expect(runs).toHaveBeenCalledOnce();
    state.a = 2;
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('returns the callback result', () => {
    expect(untracked(() => 42)).toBe(42);
  });
});
