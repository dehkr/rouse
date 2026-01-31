import type { RouseFetchOptions } from '../types';

export async function http(url: string, options: RouseFetchOptions = {}) {
  const headers = new Headers(options.headers);
  headers.set('Rouse-Request', 'true');

  // Handle form serialization
  let body = options.body;
  if (options.serializeForm) {
    body = new FormData(options.serializeForm);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`[Rouse] Fetch failed: ${response.status}`);
  }

  return response.text();
}
