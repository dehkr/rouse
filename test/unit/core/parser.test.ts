import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  parseDataSourcePath,
  parseDeclarations,
  parseDirectiveValue,
  parseFetchSubject,
  parseStoreRef,
  parseStoreValue,
  parseTriggerSubjectPairs,
  parseTriggers,
  safeJSONParse,
  stripQuotes,
} from '../../../src/core/parser';

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

describe('parseTriggers', () => {
  it('returns [] for an empty or missing value', () => {
    expect(parseTriggers('')).toEqual([]);
    expect(parseTriggers(null)).toEqual([]);
  });

  it('splits triggers on any whitespace', () => {
    expect(parseTriggers('click\n\tinput  change').map((t) => t.event)).toEqual([
      'click',
      'input',
      'change',
    ]);
  });

  it('parses an event with no modifiers', () => {
    expect(parseTriggers('click')).toEqual([{ event: 'click', options: {} }]);
  });

  it('separates the event from dot-separated modifiers with a pipe', () => {
    expect(parseTriggers('submit|prevent.once')).toEqual([
      { event: 'submit', options: { prevent: true, once: true } },
    ]);
  });

  it('maps stop-immediate to stopImmediate', () => {
    expect(parseTriggers('click|stop-immediate')[0]?.options).toEqual({
      stopImmediate: true,
    });
  });

  it('maps a listener target to listenOn', () => {
    expect(parseTriggers('scroll|window')[0]?.options).toEqual({ listenOn: 'window' });
  });

  it('binds a timing argument, or flags timing without one', () => {
    expect(parseTriggers('input|debounce-[300ms]')[0]?.options).toEqual({
      debounce: '300ms',
    });
    expect(parseTriggers('input|throttle')[0]?.options).toEqual({ throttle: true });
  });

  it('collects key arguments, lowercased, with space mapped to " "', () => {
    expect(parseTriggers('keydown|key-[Enter].key-[space]')[0]?.options).toEqual({
      key: ['enter', ' '],
    });
  });

  it('keeps a comma inside a key argument as data', () => {
    expect(parseTriggers('keydown|key-[,]')[0]?.options).toEqual({ key: [','] });
  });

  it('splits a trigger-source argument off the event and keeps it raw', () => {
    expect(parseTriggers('timeout-[5s]')).toEqual([
      { event: 'timeout', options: {}, arg: '5s' },
    ]);
    expect(parseTriggers('edit-[@cart.items]|debounce')[0]).toEqual({
      event: 'edit',
      options: { debounce: true },
      arg: '@cart.items',
    });
  });

  it('keeps a hyphenated event name whole', () => {
    expect(parseTriggers('my-custom-event')[0]?.event).toBe('my-custom-event');
  });

  it('strips outer quotes from the whole value', () => {
    expect(parseTriggers("'click'")[0]?.event).toBe('click');
  });

  it('warns and returns [] when triggers are separated by commas', () => {
    const warn = silenceWarn();
    expect(parseTriggers('click,input')).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each(['click|', 'click|once|prevent', '|once'])(
    'warns and skips the malformed trigger %s',
    (value) => {
      const warn = silenceWarn();
      expect(parseTriggers(`${value} change`)).toEqual([
        { event: 'change', options: {} },
      ]);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it.each(['click|bogus', 'click|bogus-[x]', 'click|debounce-[]'])(
    'warns on the bad modifier in %s and drops it',
    (value) => {
      const warn = silenceWarn();
      expect(parseTriggers(value)).toEqual([{ event: 'click', options: {} }]);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it('reads modifiers written without a pipe as an event named click.debounce', () => {
    expect(parseTriggers('click.debounce-[300ms]')).toEqual([
      { event: 'click.debounce', options: {}, arg: '300ms' },
    ]);
  });
});

describe('parseTriggerSubjectPairs', () => {
  it('pairs every trigger in a group with the group subject', () => {
    expect(parseTriggerSubjectPairs('input|debounce change: /api/users')).toEqual([
      { trigger: { event: 'input', options: { debounce: true } }, subject: '/api/users' },
      { trigger: { event: 'change', options: {} }, subject: '/api/users' },
    ]);
  });

  it('gives a group without a colon a null subject', () => {
    expect(parseTriggerSubjectPairs('click, submit: /save')).toEqual([
      { trigger: { event: 'click', options: {} }, subject: null },
      { trigger: { event: 'submit', options: {} }, subject: '/save' },
    ]);
  });
});

describe('parseFetchSubject', () => {
  it('splits a leading method from the URL', () => {
    expect(parseFetchSubject('POST /api/users')).toEqual({
      method: 'POST',
      url: '/api/users',
    });
  });

  it('uppercases a lowercase method', () => {
    expect(parseFetchSubject('delete /api/1')).toEqual({
      method: 'DELETE',
      url: '/api/1',
    });
  });

  it('accepts a method alone or a URL alone', () => {
    expect(parseFetchSubject('DELETE')).toEqual({ method: 'DELETE', url: undefined });
    expect(parseFetchSubject('/api/users')).toEqual({ url: '/api/users' });
  });

  it('reads a relative URL spelled like a method as the method', () => {
    expect(parseFetchSubject('query')).toEqual({ method: 'QUERY', url: undefined });
    expect(parseFetchSubject('./query')).toEqual({ url: './query' });
  });
});

describe('parseStoreValue', () => {
  it('returns the name and an optional URL', () => {
    expect(parseStoreValue('user: /api/user')).toEqual({
      name: 'user',
      url: '/api/user',
    });
    expect(parseStoreValue('user')).toEqual({ name: 'user', url: null });
  });

  it('returns null without a name', () => {
    expect(parseStoreValue('')).toBeNull();
  });

  it('warns and keeps the first store when given several', () => {
    const warn = silenceWarn();
    expect(parseStoreValue('a: /a, b: /b')).toEqual({ name: 'a', url: '/a' });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('parseDataSourcePath', () => {
  it('splits the source from a nested path', () => {
    expect(parseDataSourcePath('@cart.items.total')).toEqual({
      source: 'cart',
      namespace: null,
      nestedPath: 'items.total',
    });
  });

  it('reads a bare source', () => {
    expect(parseDataSourcePath('@cart')).toEqual({
      source: 'cart',
      namespace: null,
      nestedPath: '',
    });
  });

  it('splits a :: namespace and its nested path', () => {
    expect(parseDataSourcePath('@cart::status.syncing')).toEqual({
      source: 'cart',
      namespace: 'status',
      nestedPath: 'syncing',
    });
    expect(parseDataSourcePath('%::index')).toEqual({
      source: '',
      namespace: 'index',
      nestedPath: '',
    });
  });
});

describe('parseStoreRef', () => {
  it('returns the source and nested path of a data reference', () => {
    expect(parseStoreRef('@cart.items')).toEqual({ source: 'cart', nestedPath: 'items' });
  });

  it('warns and returns null for a namespace reference', () => {
    const warn = silenceWarn();
    expect(parseStoreRef('@cart::status', 'push')).toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain('rz-push:');
  });
});

describe('parseDeclarations', () => {
  it('splits declarations into property/value pairs', () => {
    expect(parseDeclarations('color: red; margin: 0 auto')).toEqual([
      ['color', 'red'],
      ['margin', '0 auto'],
    ]);
  });

  it('ignores empty declarations and keeps delimiters inside parens and quotes', () => {
    expect(parseDeclarations(`background: url(data:a;b); content: 'x;y:z';`)).toEqual([
      ['background', 'url(data:a;b)'],
      ['content', `'x;y:z'`],
    ]);
  });
});

describe('safeJSONParse', () => {
  it('parses ordinary JSON', () => {
    expect(safeJSONParse('{"a": [1, {"b": true}]}')).toEqual({ a: [1, { b: true }] });
  });

  it('drops prototype-pollution keys at any depth and warns', () => {
    const warn = silenceWarn();
    const result = safeJSONParse(
      '{"__proto__": {"polluted": 1}, "a": {"constructor": {"x": 1}, "ok": 1}}',
    ) as Record<string, any>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(false);
    expect(Object.hasOwn(result.a, 'constructor')).toBe(false);
    expect(result.a.ok).toBe(1);
    expect(({} as any).polluted).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('throws on malformed JSON', () => {
    expect(() => safeJSONParse('{bad')).toThrow(SyntaxError);
  });
});

describe('stripQuotes', () => {
  it('strips matching outer quotes and trims inside them', () => {
    expect(stripQuotes("' a '")).toBe('a');
    expect(stripQuotes('"b"')).toBe('b');
  });

  it('leaves unmatched or single quotes alone', () => {
    expect(stripQuotes(`'a"`)).toBe(`'a"`);
    expect(stripQuotes("'")).toBe("'");
  });
});
