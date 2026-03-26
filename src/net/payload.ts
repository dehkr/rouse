import type { RouseConfig } from '../core/app';
import type { RouseReqOpts } from '../types';

/**
 * Prepares the URL, headers, and body for a network request.
 */
export function preparePayload(
  url: string,
  options: RouseReqOpts,
  globalConfig: RouseConfig,
) {
  const { method = 'GET', headers = {}, body, form, ...restOptions } = options;

  // Resolve URL
  let finalUrl = url;
  if (globalConfig.network?.baseUrl && !url.startsWith('http') && !url.startsWith('//')) {
    finalUrl = `${globalConfig.network?.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // Merge headers
  const reqHeaders = new Headers(globalConfig.network?.fetch?.headers);
  new Headers(headers).forEach((val, key) => {
    reqHeaders.set(key, val);
  });

  reqHeaders.set('Rouse-Request', 'true');

  if (!reqHeaders.has('Accept')) {
    reqHeaders.set('Accept', 'application/json, text/html, application/xhtml+xml');
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
    else {
      finalBody = String(body);
    }
  }

  // Fall back to form serialization if no explicit body was provided
  else if (form) {
    // GET forms should append to the URL as query parameters
    if (method === 'GET' || method === 'HEAD') {
      const formData = new FormData(form);
      const urlObj = new URL(finalUrl, document.baseURI);

      formData.forEach((value, key) => {
        if (typeof value === 'string') {
          urlObj.searchParams.append(key, value);
        } else if (value instanceof File) {
          // Native HTML behavior is to send the filename in the query string
          urlObj.searchParams.append(key, value.name);
        }
      });

      finalUrl = urlObj.toString();
    }

    // POST/PUT/PATCH -> send as FormData body
    else {
      finalBody = new FormData(form);
    }
  }

  return { finalUrl, method, reqHeaders, finalBody, restOptions };
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
