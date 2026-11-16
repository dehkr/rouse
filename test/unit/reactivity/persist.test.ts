import { effectScope } from 'alien-signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { reactive } from '../../../src/reactivity/reactive';
import type { PersistStorage } from '../../../src/reactivity/persist';

/** A `Storage` backed by a `Map`, with spies on reads and writes. */
class MemoryStorage {
  data = new Map<string, string>();
  getItem = vi.fn((key: string) => this.data.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => {
    this.data.set(key, value);
  });
  removeItem(key: string) {
    this.data.delete(key);
  }
}

let local: MemoryStorage;
let session: MemoryStorage;
let errors: ReturnType<typeof vi.spyOn>;
let warnings: ReturnType<typeof vi.spyOn>;
const stops: Array<() => void> = [];

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Report latches and claim warnings are page-wide, so every test uses its own keys
let keyCount = 0;
const uniqueKey = () => `persist-test-${++keyCount}`;

/** Persists `data` inside an effect scope that stops after the test. */
function persisted<T extends object>(
  data: T,
  key: string,
  persist: PersistStorage = 'local',
): { state: T; stop: () => void } {
  let state!: T;
  const stop = effectScope(() => {
    state = reactive(data, { persist, persistKey: key });
  });
  stops.push(stop);
  return { state, stop };
}

const saved = (storage: MemoryStorage, key: string) => JSON.parse(storage.data.get(key)!);
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve));
/** Resolves after every microtask queued before the call, including a queued save. */
const nextMicrotask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('restore', () => {
  it('merges a saved object, keeping new initial fields and skipping accessors and methods', () => {
    const key = uniqueKey();
    local.data.set(
      key,
      JSON.stringify({ score: 7, total: 99, greet: 'saved', removed: 1 }),
    );

    const { state } = persisted(
      {
        score: 0,
        added: 'default',
        get total() {
          return this.score * 2;
        },
        greet() {
          return 'hi';
        },
      },
      key,
    );

    expect(state.score).toBe(7);
    expect(state.added).toBe('default');
    expect(state.total).toBe(14);
    expect(state.greet()).toBe('hi');
    expect((state as any).removed).toBe(1);
  });

  it("replaces an array's contents", () => {
    const key = uniqueKey();
    local.data.set(key, JSON.stringify(['b', 'c']));

    const { state } = persisted(['a'], key);

    expect([...state]).toEqual(['b', 'c']);
  });

  it('ignores a saved `__proto__` key', () => {
    const key = uniqueKey();
    local.data.set(key, '{"__proto__":{"polluted":true},"a":2}');

    const { state } = persisted({ a: 1 }, key);

    expect(state.a).toBe(2);
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
  });

  it('falls back to the initial value on invalid JSON, reporting once per key', () => {
    const key = uniqueKey();
    local.data.set(key, '{not json');

    const first = persisted({ a: 1 }, key);
    first.stop();
    const second = persisted({ a: 1 }, key);

    expect(first.state.a).toBe(1);
    expect(second.state.a).toBe(1);
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0]).toContain(`restore '${key}' in localStorage`);
  });

  it('falls back to the initial value on a mismatched type', () => {
    const objectKey = uniqueKey();
    const arrayKey = uniqueKey();
    local.data.set(objectKey, '[1, 2]');
    local.data.set(arrayKey, '{"a": 1}');

    expect(persisted({ a: 1 }, objectKey).state).toEqual({ a: 1 });
    expect([...persisted(['x'], arrayKey).state]).toEqual(['x']);
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it('stays silent when nothing is saved', () => {
    persisted({ a: 1 }, uniqueKey());
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('save', () => {
  it('saves a change at any depth', async () => {
    const key = uniqueKey();
    const { state } = persisted({ board: { rows: [[1]] } }, key);

    state.board.rows[0]!.push(2);
    await nextMicrotask();

    expect(saved(local, key)).toEqual({ board: { rows: [[1, 2]] } });
  });

  it('saves once per task, after a microtask', async () => {
    const key = uniqueKey();
    const { state } = persisted({ a: 0, b: 0 }, key);
    await nextMicrotask();
    local.setItem.mockClear();

    state.a = 1;
    state.b = 2;
    state.a = 3;
    expect(local.setItem).not.toHaveBeenCalled();

    await nextMicrotask();
    expect(local.setItem).toHaveBeenCalledOnce();
    expect(saved(local, key)).toEqual({ a: 3, b: 2 });
  });

  it("doesn't save getters, and getter reads don't trigger a save", async () => {
    const key = uniqueKey();
    const getter = vi.fn(function (this: { n: number }) {
      return this.n + 1;
    });
    const { state } = persisted(
      {
        n: 1,
        get next() {
          return getter.call(this);
        },
      },
      key,
    );
    await nextMicrotask();
    const writes = local.setItem.mock.calls.length;

    void state.next;
    await nextMicrotask();

    expect(local.setItem).toHaveBeenCalledTimes(writes);
    expect(saved(local, key)).toEqual({ n: 1 });
  });

  it('reports a throwing write once and keeps the state working', async () => {
    const key = uniqueKey();
    local.setItem.mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    const { state } = persisted({ n: 0 }, key);
    await nextMicrotask();
    state.n = 1;
    await nextMicrotask();
    state.n = 2;
    await nextMicrotask();

    expect(state.n).toBe(2);
    expect(local.setItem).toHaveBeenCalledTimes(3);
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0]).toContain(`save '${key}' in localStorage`);
  });

  it('reports cyclic state once without throwing', async () => {
    const key = uniqueKey();
    const { state } = persisted({ node: {} as any, n: 0 }, key);

    expect(() => {
      state.node.self = state.node;
      state.n = 1;
    }).not.toThrow();
    await nextMicrotask();

    expect(errors).toHaveBeenCalledOnce();
  });

  it('writes a queued save immediately when its effect scope stops', () => {
    const key = uniqueKey();
    const { state, stop } = persisted({ n: 0 }, key);

    state.n = 1;
    stop();

    expect(local.setItem).toHaveBeenCalledOnce();
    expect(saved(local, key)).toEqual({ n: 1 });
  });

  it('stops saving when its effect scope stops', async () => {
    const key = uniqueKey();
    const { state, stop } = persisted({ n: 0 }, key);

    stop();
    state.n = 1;
    await nextMicrotask();

    expect(saved(local, key)).toEqual({ n: 0 });
  });

  it('uses sessionStorage for `session`', async () => {
    const key = uniqueKey();
    persisted({ n: 0 }, key, 'session');
    await nextMicrotask();

    expect(session.data.has(key)).toBe(true);
    expect(local.data.has(key)).toBe(false);
  });
});

describe('options', () => {
  it('throws on an invalid persist call', () => {
    const calls: any[] = [
      { persist: 'local' },
      { persist: 'local', persistKey: '' },
      { persist: 'disk', persistKey: 'k' },
      { persistKey: 'k' },
    ];
    for (const options of calls) {
      expect(() => reactive({}, options)).toThrow(/persistKey/);
    }
  });

  it('warns and ignores the options on an object that is already reactive', () => {
    const key = uniqueKey();
    const raw = { n: 0 };
    const proxy = reactive(raw);

    expect(reactive(raw, { persist: 'local', persistKey: key })).toBe(proxy);
    expect(reactive(proxy, { persist: 'local', persistKey: key })).toBe(proxy);
    expect(warnings).toHaveBeenCalledTimes(2);
    expect(local.getItem).not.toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it('warns and returns a value it cannot proxy as-is', () => {
    const date = new Date();

    expect(reactive(date, { persist: 'local', persistKey: uniqueKey() })).toBe(date);
    expect(warnings).toHaveBeenCalledOnce();
    expect(local.setItem).not.toHaveBeenCalled();
  });
});

describe('key claims', () => {
  it('warns once, after a microtask, about two live claims on one key', async () => {
    const key = uniqueKey();
    persisted({ n: 0 }, key);
    persisted({ n: 0 }, key);
    persisted({ n: 0 }, key);

    expect(warnings).not.toHaveBeenCalled();
    await flushMicrotasks();

    expect(warnings).toHaveBeenCalledOnce();
    expect(warnings.mock.calls[0][0]).toContain(`'${key}' in localStorage`);
  });

  it("doesn't warn about a claim released before the microtask", async () => {
    const key = uniqueKey();
    const old = persisted({ n: 0 }, key);
    persisted({ n: 0 }, key);
    old.stop();

    await flushMicrotasks();

    expect(warnings).not.toHaveBeenCalled();
  });

  it("doesn't treat one key in local and session storage as a conflict", async () => {
    const key = uniqueKey();
    persisted({ n: 0 }, key, 'local');
    persisted({ n: 0 }, key, 'session');

    await flushMicrotasks();

    expect(warnings).not.toHaveBeenCalled();
  });
});
