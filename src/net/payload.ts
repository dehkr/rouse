import type { RouseReqOpts } from '../types';

/**
 * Prepares the URL, headers, and body for a network request.
 */
export function preparePayload(
  url: string,
  options: RouseReqOpts,
  globalConfig: { baseUrl: string; headers: HeadersInit },
) {
  const { method = 'GET', headers = {}, body, serializeForm, ...restOptions } = options;

  // Resolve URL
  let finalUrl = url;
  if (globalConfig.baseUrl && !url.startsWith('http') && !url.startsWith('//')) {
    finalUrl = `${globalConfig.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // Merge headers
  const reqHeaders = new Headers(globalConfig.headers);
  new Headers(headers).forEach((val, key) => reqHeaders.set(key, val));

  reqHeaders.set('Rouse-Request', 'true');

  if (!reqHeaders.has('Accept')) {
    reqHeaders.set('Accept', 'application/json, text/html, application/xhtml+xml');
  }

  // Prepare body
  let finalBody: BodyInit | null = body || null;

  if (serializeForm) {
    if (method === 'GET' || method === 'HEAD') {
      // GET forms should append to the URL as query parameters
      const formData = new FormData(serializeForm);
      const urlObj = new URL(finalUrl, document.baseURI);

      formData.forEach((value, key) => {
        urlObj.searchParams.append(key, value.toString());
      });
      finalUrl = urlObj.toString();
    } else {
      // POST/PUT/PATCH -> send as FormData body
      finalBody = new FormData(serializeForm);
    }
  } else if (body instanceof FormData) {
    // Already FormData, pass through
    finalBody = body;
    // Let browser set Content-Type
  } else if (body instanceof URLSearchParams) {
    // URLSearchParams -> application/x-www-form-urlencoded
    finalBody = body;
    if (!reqHeaders.has('Content-Type')) {
      reqHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
    }
  } else if (body instanceof Blob || body instanceof File) {
    // Binary data, pass through
    finalBody = body;
    // Content-Type should be set by caller or already on Blob
  } else if (
    body &&
    typeof body === 'object' &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof ReadableStream)
  ) {
    // Plain object -> JSON
    finalBody = JSON.stringify(body);
    if (!reqHeaders.has('Content-Type')) {
      reqHeaders.set('Content-Type', 'application/json');
    }
  } else if (typeof body === 'string') {
    // String body, pass through
    finalBody = body;
    // Caller should set Content-Type
  }

  return { finalUrl, method, reqHeaders, finalBody, restOptions };
}
