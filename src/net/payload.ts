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
  if (globalConfig.baseUrl && !url.startsWith('http') && !url.startsWith('//')) {
    finalUrl = `${globalConfig.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // Merge headers
  const reqHeaders = new Headers(globalConfig.request?.headers);
  new Headers(headers).forEach((val, key) => reqHeaders.set(key, val));

  reqHeaders.set('Rouse-Request', 'true');

  if (!reqHeaders.has('Accept')) {
    reqHeaders.set('Accept', 'application/json, text/html, application/xhtml+xml');
  }

  // Prepare request body
  let finalBody: BodyInit | null = null;

  if (form) {
    // GET forms should append to the URL as query parameters
    if (method === 'GET' || method === 'HEAD') {
      const formData = new FormData(form);
      const urlObj = new URL(finalUrl, document.baseURI);

      formData.forEach((value, key) => {
        urlObj.searchParams.append(key, value.toString());
      });

      finalUrl = urlObj.toString();
    }
    // POST/PUT/PATCH -> send as FormData body
    else {
      finalBody = new FormData(form);
    }
  }

  // Pass through all native binary/stream BodyInit types
  else if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof File ||
    body instanceof ArrayBuffer ||
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
  ) {
    finalBody = body;
  }

  // URLSearchParams -> application/x-www-form-urlencoded
  else if (body instanceof URLSearchParams) {
    finalBody = body;
    if (!reqHeaders.has('Content-Type')) {
      reqHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
    }
  }

  // Binary data, pass through
  else if (body instanceof Blob || body instanceof File) {
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
  else if (body != null) {
    finalBody = String(body);
  }

  return { finalUrl, method, reqHeaders, finalBody, restOptions };
}
