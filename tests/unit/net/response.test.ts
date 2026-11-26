import { describe, expect, it } from 'vite-plus/test';
import {
  errorResponse,
  fallbackResponse,
  isJsonType,
  mapCatchError,
  normalizeResponse,
} from '../../../src/net/response';
import type { FetchRequest } from '../../../src/types';

const config = { url: '/api' } as FetchRequest;

const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
  normalizeResponse(new Response(body, init), config);

describe('normalizeResponse', () => {
  it('parses a JSON body and exposes status, headers, and config', async () => {
    const res = await respond('{"a":1}', {
      headers: { 'Content-Type': 'application/json', 'Rouse-Place': '#x' },
    });
    expect(res.data).toEqual({ a: 1 });
    expect(res.error).toBeNull();
    expect(res.status).toBe(200);
    expect(res.headers?.['rouse-place']).toBe('#x');
    expect(res.config).toBe(config);
  });

  it('parses +json types as JSON', async () => {
    const res = await respond('{"a":1}', {
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    expect(res.data).toEqual({ a: 1 });
  });

  it('reads an empty JSON body as null', async () => {
    const res = await respond('', { headers: { 'Content-Type': 'application/json' } });
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
  });

  it('reads text and XML types as text', async () => {
    const html = await respond('<p>hi</p>', { headers: { 'Content-Type': 'text/html' } });
    const svg = await respond('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
    expect(html.data).toBe('<p>hi</p>');
    expect(svg.data).toBe('<svg/>');
  });

  it('reads other types as a Blob', async () => {
    const res = await respond(new Uint8Array([1, 2]), {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    expect(res.data).toBeInstanceOf(Blob);
  });

  it.each([204, 205])('skips the body on %d', async (status) => {
    const res = await respond(null, { status });
    expect(res.data).toBeNull();
    expect(res.error).toBeNull();
  });

  it('reports malformed JSON as PARSE_ERROR', async () => {
    const res = await respond('{bad', {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('PARSE_ERROR');
  });

  it('refuses to read an event stream', async () => {
    const res = await respond('data: x\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('PARSE_ERROR');
  });

  it('reports an HTTP error with its status and parsed body', async () => {
    const res = await respond('{"field":"required"}', {
      status: 422,
      statusText: 'Unprocessable Content',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.data).toEqual({ field: 'required' });
    expect(res.error).toEqual({
      message: 'Unprocessable Content',
      code: 422,
      body: { field: 'required' },
      parseError: undefined,
    });
  });

  it('lets an HTTP error replace a parse error, keeping its message', async () => {
    const res = await respond('<html>crash</html>', {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.error?.code).toBe(500);
    expect(res.error?.message).toBe('Request failed');
    expect(res.error?.parseError).toEqual(expect.any(String));
  });
});

describe('mapCatchError', () => {
  it('maps a thrown error to NETWORK_ERROR with its message', () => {
    const original = new TypeError('Failed to fetch');
    expect(mapCatchError(original)).toEqual({
      message: 'Failed to fetch',
      code: 'NETWORK_ERROR',
      original,
    });
  });

  it('falls back to a generic message for a non-Error', () => {
    expect(mapCatchError('nope').message).toBe('Network error');
  });

  it.each([
    ['CANCELED', 'Request canceled'],
    ['TIMEOUT', 'Request timed out'],
  ] as const)('maps an abort code of %s to its message', (code, message) => {
    expect(mapCatchError(new Error('x'), code)).toMatchObject({ code, message });
  });
});

describe('errorResponse and fallbackResponse', () => {
  it('build a response with only an error', () => {
    const error = { message: 'm', code: 'NETWORK_ERROR' as const };
    expect(errorResponse(config, error)).toEqual({
      data: null,
      error,
      response: null,
      headers: null,
      status: null,
      config,
    });
  });

  it('defaults the fallback code to CANCELED', () => {
    expect(fallbackResponse(config, 'skipped').error).toEqual({
      message: 'skipped',
      code: 'CANCELED',
    });
  });
});

describe('isJsonType', () => {
  it.each([
    ['application/json; charset=utf-8', true],
    ['application/problem+json', true],
    ['text/json', false],
    ['text/html', false],
  ])('%s → %s', (type, expected) => {
    expect(isJsonType(type)).toBe(expected);
  });
});
