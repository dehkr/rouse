import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { preparePayload, resolveUrl } from '../../../src/net/payload';
import type { FetchRequest } from '../../../src/types';

beforeEach(() => {
  vi.stubGlobal('document', { baseURI: 'https://app.test/page/' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const prepare = (options: Partial<FetchRequest>, baseUrl = '') =>
  preparePayload({ url: '/api', ...options } as FetchRequest, baseUrl);

describe('resolveUrl', () => {
  it('returns an absolute URL unchanged', () => {
    expect(resolveUrl('https://other.test/x', 'https://base.test/').href).toBe(
      'https://other.test/x',
    );
  });

  it('resolves against the document base without a baseUrl', () => {
    expect(resolveUrl('items', '').href).toBe('https://app.test/page/items');
    expect(resolveUrl('/items', '').href).toBe('https://app.test/items');
  });

  it('treats baseUrl as a directory, with or without a trailing slash', () => {
    expect(resolveUrl('items', 'https://api.test/v1').href).toBe(
      'https://api.test/v1/items',
    );
    expect(resolveUrl('items', 'https://api.test/v1/').href).toBe(
      'https://api.test/v1/items',
    );
  });

  it('resolves a relative baseUrl against the document base', () => {
    expect(resolveUrl('items', '/api').href).toBe('https://app.test/api/items');
  });

  it.each(['blob:https://app.test/x', 'data:text/plain,hi'])(
    'rejects the unsupported scheme in %s',
    (url) => {
      expect(() => resolveUrl(url, '')).toThrow(TypeError);
    },
  );
});

describe('preparePayload', () => {
  it('defaults to GET and sets the Rouse request headers', () => {
    const { method, reqHeaders, finalBody } = prepare({});
    expect(method).toBe('GET');
    expect(reqHeaders.get('Rouse-Request')).toBe('true');
    expect(reqHeaders.get('Accept')).toContain('application/json');
    expect(finalBody).toBeNull();
  });

  it('uppercases the method', () => {
    expect(prepare({ method: 'post' as FetchRequest['method'] }).method).toBe('POST');
  });

  it.each(['GET', 'HEAD'] as const)('throws on a %s request with a body', (method) => {
    expect(() => prepare({ method, body: { a: 1 } })).toThrow(TypeError);
  });

  it('replaces URL query values with params, repeating array values', () => {
    const { finalUrl } = prepare({
      url: '/api?page=1&keep=y',
      params: { page: 2, tag: ['a', 'b'], skip: null },
    });
    const url = new URL(finalUrl);
    expect(url.searchParams.getAll('page')).toEqual(['2']);
    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(url.searchParams.get('keep')).toBe('y');
    expect(url.searchParams.has('skip')).toBe(false);
  });

  it('removes a header set to null and sends falsy values literally', () => {
    // Untyped callers can pass non-string header values
    const headers = { 'Rouse-Request': null, 'X-Zero': 0, 'X-Empty': '' } as Record<
      string,
      any
    >;
    const { reqHeaders } = prepare({ headers });
    expect(reqHeaders.has('Rouse-Request')).toBe(false);
    expect(reqHeaders.get('X-Zero')).toBe('0');
    expect(reqHeaders.get('X-Empty')).toBe('');
  });

  it('serializes an object body as JSON', () => {
    const { finalBody, reqHeaders } = prepare({ method: 'POST', body: { a: 1 } });
    expect(finalBody).toBe('{"a":1}');
    expect(reqHeaders.get('Content-Type')).toBe('application/json');
  });

  it('sends URLSearchParams as form-urlencoded', () => {
    const body = new URLSearchParams({ a: '1' });
    const { finalBody, reqHeaders } = prepare({ method: 'POST', body });
    expect(finalBody).toBe(body);
    expect(reqHeaders.get('Content-Type')).toBe('application/x-www-form-urlencoded');
  });

  it('passes strings, FormData, and binary bodies through without a Content-Type', () => {
    for (const body of ['raw', new FormData(), new Blob(['x']), new Uint8Array([1])]) {
      const { finalBody, reqHeaders } = prepare({ method: 'POST', body });
      expect(finalBody).toBe(body);
      expect(reqHeaders.has('Content-Type')).toBe(false);
    }
  });

  it('sends a number body as text/plain', () => {
    const { finalBody, reqHeaders } = prepare({ method: 'POST', body: 42 as any });
    expect(finalBody).toBe('42');
    expect(reqHeaders.get('Content-Type')).toBe('text/plain');
  });

  it('keeps a declared Content-Type over the body default', () => {
    const { reqHeaders } = prepare({
      method: 'POST',
      body: { a: 1 },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(reqHeaders.get('Content-Type')).toBe('application/merge-patch+json');
  });

  it('leaves url, headers, body, and params out of the rest options', () => {
    const { restOptions } = prepare({
      method: 'POST',
      body: 'x',
      headers: { a: '1' },
      params: { p: 1 },
      credentials: 'include',
    });
    expect(restOptions).toEqual({ method: 'POST', credentials: 'include' });
  });
});
