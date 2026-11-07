import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  getNestedVal,
  getPathParts,
  getPathRoot,
  setNestedVal,
} from '../../../src/core/path';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getNestedVal', () => {
  it('reads a top-level and a nested key', () => {
    const obj = { a: 1, b: { c: { d: 'deep' } } };
    expect(getNestedVal(obj, 'a')).toBe(1);
    expect(getNestedVal(obj, 'b.c.d')).toBe('deep');
  });

  it('returns undefined through a missing or null segment', () => {
    const obj = { a: null, b: {} };
    expect(getNestedVal(obj, 'a.x')).toBeUndefined();
    expect(getNestedVal(obj, 'b.x.y')).toBeUndefined();
  });

  it('returns undefined for a missing object or path', () => {
    expect(getNestedVal(null, 'a')).toBeUndefined();
    expect(getNestedVal({ a: 1 }, undefined)).toBeUndefined();
    expect(getNestedVal({ a: 1 }, '')).toBeUndefined();
  });

  it('reads array indexes as dot segments', () => {
    expect(getNestedVal({ list: ['x', 'y'] }, 'list.1')).toBe('y');
  });

  it('treats bracket syntax as part of the key', () => {
    expect(getNestedVal({ 'list[0]': 'literal' }, 'list[0]')).toBe('literal');
  });
});

describe('setNestedVal', () => {
  it('writes a nested key, creating missing objects on the way', () => {
    const obj: Record<string, any> = {};
    setNestedVal(obj, 'a.b.c', 1);
    expect(obj).toEqual({ a: { b: { c: 1 } } });
  });

  it('replaces a null segment with an object', () => {
    const obj: Record<string, any> = { a: null };
    setNestedVal(obj, 'a.b', 1);
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it('warns and writes nothing through a primitive segment', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const obj = { a: 5 };
    setNestedVal(obj, 'a.b', 1);
    expect(obj).toEqual({ a: 5 });
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'refuses to write through or to %s',
    (key) => {
      const obj: Record<string, any> = {};
      setNestedVal(obj, `${key}.polluted`, true);
      setNestedVal(obj, `a.${key}`, true);
      expect(obj).toEqual({});
      expect(({} as any).polluted).toBeUndefined();
    },
  );

  it('ignores a non-object target or a missing path', () => {
    const obj = { a: 1 };
    setNestedVal(obj, undefined, 2);
    setNestedVal(obj, '', 2);
    setNestedVal('str', 'a', 2);
    expect(obj).toEqual({ a: 1 });
  });
});

describe('getPathRoot', () => {
  it('returns the first segment', () => {
    expect(getPathRoot('cart.items.0')).toBe('cart');
    expect(getPathRoot('cart')).toBe('cart');
  });

  it('returns undefined for an empty path', () => {
    expect(getPathRoot('')).toBeUndefined();
    expect(getPathRoot(undefined)).toBeUndefined();
  });
});

describe('getPathParts', () => {
  it('splits on dots only', () => {
    expect(getPathParts('a.b[0].c')).toEqual(['a', 'b[0]', 'c']);
  });

  it('returns the cached array for a repeated path', () => {
    expect(getPathParts('x.y')).toBe(getPathParts('x.y'));
  });
});
