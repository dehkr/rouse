import { fail } from '../core/diagnostics';
import type { FetchRequest } from '../types';

/**
 * Resolves a request URL against `baseUrl`, falling back to the document base.
 * A relative `baseUrl` is resolved against the document base. An absolute URL is
 * returned unchanged.
 */
export function resolveUrl(url: string, baseUrl: string): URL {
  try {
    if (isAbsoluteUrl(url)) {
      return new URL(url);
    }

    // Resolve a relative `baseUrl` against the document first to make it absolute
    const base = baseUrl
      ? new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, document.baseURI)
      : document.baseURI;

    return new URL(url, base);
  } catch (err) {
    fail(`Failed to construct URL: '${url}'.`, TypeError, { cause: err });
  }
}

/**
 * Prepares the URL, headers, and body for a network request. `url` is left out of
 * `restOptions`, since it isn't a `RequestInit` field.
 */
export function preparePayload(options: FetchRequest, baseUrl: string) {
  const { url, headers = {}, body, params, ...restOptions } = options;
  const method = (options.method || 'GET').toUpperCase();

  if (body != null && (method === 'GET' || method === 'HEAD')) {
    fail(
      `A ${method} request can't have a body. Pass query values as 'params', or use a method that takes a body.`,
      TypeError,
    );
  }

  const urlObj = resolveUrl(url as string, baseUrl);

  // A param replaces any value the URL already carries for its key
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val == null) continue;
      urlObj.searchParams.delete(key);
      for (const v of Array.isArray(val) ? val : [val]) {
        urlObj.searchParams.append(key, String(v));
      }
    }
  }

  const reqHeaders = new Headers();
  reqHeaders.set('Rouse-Request', 'true');
  reqHeaders.set('Accept', 'application/json, text/html, image/svg+xml, */*;q=0.8');

  // To omit a header (e.g., suppressing a framework default like Rouse-Request),
  // set its value to null or undefined. An empty string is sent as an empty
  // header value. All other values, including false and 0, are sent literally.
  for (const [key, val] of Object.entries(headers)) {
    if (val == null) {
      reqHeaders.delete(key);
    } else {
      // Merge user-provided headers
      reqHeaders.set(key, String(val));
    }
  }

  // Prepare request body. Its type is a default, so a declared `Content-Type` wins.
  let finalBody: BodyInit | null = null;
  let contentType: string | null = null;

  if (body != null) {
    // Native binary/stream types and strings pass through with no default type
    if (isNativeBinaryBody(body) || typeof body === 'string') {
      finalBody = body;
    } else if (body instanceof URLSearchParams) {
      finalBody = body;
      contentType = 'application/x-www-form-urlencoded';
    } else if (typeof body === 'object') {
      finalBody = JSON.stringify(body);
      contentType = 'application/json';
    } else {
      finalBody = String(body);
      contentType = 'text/plain';
    }
  }

  if (contentType && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', contentType);
  }

  return { finalUrl: urlObj.toString(), method, reqHeaders, finalBody, restOptions };
}

/**
 * Type guard to check for native binary/stream browser BodyInit types.
 */
function isNativeBinaryBody(body: unknown): body is BodyInit {
  return (
    body instanceof FormData ||
    body instanceof Blob || // File inherits from Blob, so this catches both
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) || // Catches DataView and TypedArray
    body instanceof ReadableStream
  );
}

function isAbsoluteUrl(url: string): boolean {
  if (/^(blob|data):/.test(url)) {
    fail(`Unsupported URL scheme: '${url}'.`, TypeError);
  }
  return /^https?:\/\//i.test(url);
}
