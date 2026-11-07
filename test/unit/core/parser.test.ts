import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { parseDirectiveValue } from '../../../src/core/parser';

afterEach(() => {
  vi.restoreAllMocks();
});

const silenceWarn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('parseDirectiveValue', () => {
  it('returns [] for an empty or missing value', () => {
    expect(parseDirectiveValue('')).toEqual([]);
    expect(parseDirectiveValue('   ')).toEqual([]);
    expect(parseDirectiveValue(null)).toEqual([]);
    expect(parseDirectiveValue(undefined)).toEqual([]);
  });

  it('splits pairs on comma + whitespace and keys on the first colon + whitespace', () => {
    expect(parseDirectiveValue('beforeend: #item-list, #log > div.output')).toEqual([
      ['beforeend', '#item-list'],
      ['#log > div.output', null],
    ]);
  });

  it('parses a bare key as null and an empty quoted value as an empty string', () => {
    expect(parseDirectiveValue("flag, key: ''")).toEqual([
      ['flag', null],
      ['key', ''],
    ]);
  });

  it('splits on the first colon only', () => {
    expect(parseDirectiveValue('click: https://example.com/a: b')).toEqual([
      ['click', 'https://example.com/a: b'],
    ]);
  });

  it('keeps a colon or comma without trailing whitespace inside the value', () => {
    expect(parseDirectiveValue('url: /api?a=1,2&t=10:30')).toEqual([
      ['url', '/api?a=1,2&t=10:30'],
    ]);
  });

  it('ignores separators inside quotes', () => {
    expect(parseDirectiveValue(`title: 'a, b: c', next: 1`)).toEqual([
      ['title', 'a, b: c'],
      ['next', '1'],
    ]);
  });

  it('ignores separators inside brackets, braces, and parens', () => {
    expect(
      parseDirectiveValue('headers: {"a": 1, "b": 2}, key-[x, y]: v, fn(a, b): w'),
    ).toEqual([
      ['headers', '{"a": 1, "b": 2}'],
      ['key-[x, y]', 'v'],
      ['fn(a, b)', 'w'],
    ]);
  });

  it('accepts a trailing comma and multi-line formatting', () => {
    expect(parseDirectiveValue('\n  a: 1,\n  b: 2,\n')).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('warns on a trailing colon and skips that segment', () => {
    const warn = silenceWarn();
    expect(parseDirectiveValue('a: 1, b:')).toEqual([['a', '1']]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns on an unclosed quote or bracket', () => {
    const warn = silenceWarn();
    parseDirectiveValue("title: 'open");
    parseDirectiveValue('key-[open: v');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('warns once on a stray closing bracket', () => {
    const warn = silenceWarn();
    parseDirectiveValue('a]: 1');
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.every(([msg]) => String(msg).includes('Mismatched'))).toBe(
      true,
    );
  });
});
