import type { RouseConfig } from '../core/app';
import type { RouseRequest } from '../types';

/**
 * Prepares the URL, headers, and body for a network request.
 */
export function preparePayload(
  url: string,
  options: RouseRequest,
  globalConfig: RouseConfig,
) {
  const { headers = {}, body, form, params, ...restOptions } = options;
  const method = (options.method || 'GET').toUpperCase();

  if (body != null && form != null) {
    throw new TypeError(`Cannot specify both 'body' and 'form'.`);
  }

  let urlObj: URL;

  try {
    if (isAbsoluteUrl(url)) {
      urlObj = new URL(url);
    } else {
      let base: string;

      if (globalConfig.network?.baseUrl) {
        const configBase = globalConfig.network.baseUrl;
        base = configBase.endsWith('/') ? configBase : `${configBase}/`;
      } else {
        base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost';
      }

      urlObj = new URL(url, base);
    }
  } catch (err) {
    throw new TypeError(`Failed to construct URL: '${url}'`, { cause: err });
  }

  // Append programmatic params
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val == null) continue;
      const values = Array.isArray(val) ? val : [val];
      for (const v of values) {
        urlObj.searchParams.append(key, String(v));
      }
    }
  }

  const reqHeaders = new Headers();
  reqHeaders.set('Rouse-Request', 'true');
  reqHeaders.set('Accept', 'application/json, text/html, image/svg+xml, */*;q=0.8');

  // Merge user-provided headers. An empty string, 'null', or 'false' can be
  // passed to delete a header entirely to prevent CORS preflight rejections.
  for (const [key, val] of Object.entries(headers)) {
    if (val === '' || val === 'null' || val === 'false') {
      reqHeaders.delete(key);
    } else {
      reqHeaders.set(key, String(val));
    }
  }

  // Prepare request body
  let finalBody: BodyInit | null = null;

  if (body != null) {
    // Pass through all native binary/stream BodyInit types
    if (isNativeBinaryBody(body)) {
      finalBody = body;
    }

    // URLSearchParams
    else if (body instanceof URLSearchParams) {
      finalBody = body;
      if (!reqHeaders.has('Content-Type')) {
        reqHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
      }
    }

    // Plain object or array -> JSON
    else if (body && typeof body === 'object') {
      finalBody = JSON.stringify(body);
      if (!reqHeaders.has('Content-Type')) {
        reqHeaders.set('Content-Type', 'application/json');
      }
    }

    // String body, pass through
    else if (typeof body === 'string') {
      finalBody = body;
    }

    // Catch primitives like numbers or booleans
    // Set sensible default content-type so server knows how to parse
    else {
      finalBody = String(body);
      if (!reqHeaders.has('Content-Type')) {
        reqHeaders.set('Content-Type', 'text/plain');
      }
    }
  }

  // Fall back to form serialization if no explicit body was provided
  else if (form) {
    // GET forms should append to the URL as query parameters
    if (method === 'GET' || method === 'HEAD') {
      const formData = new FormData(form);
      formData.forEach((value, key) => {
        if (typeof value === 'string') {
          urlObj.searchParams.append(key, value);
        } else if (value instanceof File) {
          // Native HTML behavior is to send the filename in the query string
          urlObj.searchParams.append(key, value.name);
        }
      });
    }

    // POST/PUT/PATCH -> send as FormData body
    else {
      finalBody = new FormData(form);
    }
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
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
  );
}

function isAbsoluteUrl(url: string): boolean {
  if (/^(blob|data):/.test(url)) {
    throw new TypeError(`Unsupported URL scheme: '${url}'`);
  }
  return /^https?:\/\/|^\/\//i.test(url);
}
