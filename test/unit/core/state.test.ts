import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  clone,
  deepEqual,
  hasAccessor,
  isPlainObject,
  nullPaths,
  patchState,
} from '../../../src/core/state';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clone', () => {
  it('copies nested data without sharing references', () => {
    const src = { a: { b: [1, { c: 2 }] } };
    const copy = clone(src);
    expect(copy).toEqual(src);
    expect(copy.a).not.toBe(src.a);
    expect(copy.a.b[1]).not.toBe(src.a.b[1]);
  });

  it('drops functions, undefined, and accessors from objects', () => {
    const src = {
      keep: 1,
      fn() {},
      gone: undefined,
      get derived() {
        return 2;
      },
    };
    expect(clone(src)).toEqual({ keep: 1 });
  });

  it('turns functions, undefined, and holes in arrays into null, as JSON does', () => {
    // oxlint-disable-next-line no-sparse-arrays -- index 3 is a hole on purpose
    const src = [1, () => {}, undefined, , 5];
    expect(clone(src)).toEqual([1, null, null, null, 5]);
  });

  it('preserves cycles', () => {
    const src: Record<string, any> = { a: 1 };
    src.self = src;
    const copy = clone(src);
    expect(copy.self).toBe(copy);
  });

  it('warns and returns {} for a non-plain object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(clone({ when: new Date(0) })).toEqual({ when: {} });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('root.when');
  });

  it('returns primitives as-is', () => {
    expect(clone(3)).toBe(3);
    expect(clone(null)).toBeNull();
    expect(clone('s')).toBe('s');
  });
});

describe('nullPaths', () => {
  it('collects the dot-path of every null in nested objects', () => {
    expect(nullPaths({ a: null, b: { c: null, d: 1 } })).toEqual(['a', 'b.c']);
  });

  it('does not descend into arrays', () => {
    expect(nullPaths({ list: [null, { x: null }] })).toEqual([]);
  });

  it('returns [] for anything but a plain object', () => {
    expect(nullPaths(null)).toEqual([]);
    expect(nullPaths([null])).toEqual([]);
  });
});

describe('deepEqual', () => {
  it('compares nested data structurally', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });

  it('treats NaN as equal to NaN', () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
  });

  it('treats an undefined key as absent', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('detects an extra key on either side', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('compares Dates by time and RegExps by source', () => {
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(/a/g, /a/g)).toBe(true);
    expect(deepEqual(/a/g, /a/i)).toBe(false);
  });

  it('distinguishes an array from an object with the same keys', () => {
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });

  it('considers a value equal to its own clone', () => {
    const src = {
      a: 1,
      fn() {},
      get derived() {
        return 2;
      },
      list: [undefined, () => {}],
    };
    expect(deepEqual(src, clone(src))).toBe(true);
  });

  it('terminates on cycles', () => {
    const a: Record<string, any> = { x: 1 };
    a.self = a;
    const b: Record<string, any> = { x: 1 };
    b.self = b;
    expect(deepEqual(a, b)).toBe(true);
  });
});

describe('patchState', () => {
  describe('replace', () => {
    it('writes source keys and deletes keys the source lacks', () => {
      const target: Record<string, any> = { a: 1, stale: true };
      patchState(target, { a: 2, b: 3 });
      expect(target).toEqual({ a: 2, b: 3 });
    });

    it('keeps accessors on the target untouched', () => {
      const target: Record<string, any> = {
        a: 1,
        get total() {
          return this.a * 2;
        },
      };
      patchState(target, { a: 5, total: 99 });
      expect(target.total).toBe(10);
    });
  });

  describe('merge (RFC 7396)', () => {
    it('leaves absent keys alone and deletes keys set to null', () => {
      const target: Record<string, any> = { a: 1, b: 2, c: 3 };
      patchState(target, { a: 10, b: null }, 'merge');
      expect(target).toEqual({ a: 10, c: 3 });
    });

    it('merges nested objects instead of replacing them', () => {
      const target: Record<string, any> = { user: { name: 'A', age: 1 } };
      patchState(target, { user: { age: 2 } }, 'merge');
      expect(target).toEqual({ user: { name: 'A', age: 2 } });
    });

    it('seeds an object over a non-object target and drops its nested nulls', () => {
      const target: Record<string, any> = { user: 'none' };
      patchState(target, { user: { name: 'A', gone: null } }, 'merge');
      expect(target).toEqual({ user: { name: 'A' } });
    });

    it('replaces arrays wholesale', () => {
      const target: Record<string, any> = { list: [1, 2, 3] };
      patchState(target, { list: [9] }, 'merge');
      expect(target).toEqual({ list: [9] });
    });

    it('skips undefined source values', () => {
      const target: Record<string, any> = { a: 1 };
      patchState(target, { a: undefined }, 'merge');
      expect(target).toEqual({ a: 1 });
    });

    it('skips keys that are accessors on the shape it mirrors', () => {
      const shape = {
        a: 1,
        get total() {
          return 0;
        },
      };
      const baseline: Record<string, any> = { a: 1 };
      patchState(baseline, { a: 2, total: 99 }, 'merge', shape);
      expect(baseline).toEqual({ a: 2 });
    });
  });
});

describe('hasAccessor', () => {
  it('is true for getters and methods, false for data and missing keys', () => {
    const obj = {
      data: 1,
      method() {},
      get g() {
        return 1;
      },
    };
    expect(hasAccessor(obj, 'g')).toBe(true);
    expect(hasAccessor(obj, 'method')).toBe(true);
    expect(hasAccessor(obj, 'data')).toBe(false);
    expect(hasAccessor(obj, 'missing')).toBe(false);
  });
});

describe('isPlainObject', () => {
  it('accepts object literals and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('rejects arrays, null, class instances, and built-ins', () => {
    class Thing {}
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Thing())).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
  });
});
