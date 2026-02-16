import type { RequestResult, RouseReqOpts } from '../types';

// Global map to track abort controllers by key (for auto-cancellation)
const abortControllers = new Map<string | symbol, AbortController>();

/**
 * Handles Fetch/XHR switching, error normalization, retries, and response parsing.
 */
export async function request<T = any>(
  url: string,
  options: RouseReqOpts = {},
): Promise<RequestResult<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    onUploadProgress,
    serializeForm,
    retry = 0,
    timeout = 0,
    abortKey,
    ...reqOptions
  } = options;

  // Prepare headers
  const reqHeaders = new Headers(headers);
  reqHeaders.set('Rouse-Request', 'true');

  if (!reqHeaders.has('Accept')) {
    reqHeaders.set('Accept', 'application/json, text/html, application/xhtml+xml');
  }

  // Prepare body
  let finalBody: BodyInit | null = body || null;

  if (serializeForm) {
    finalBody = new FormData(serializeForm);
    // Let browser set content-type for FormData (multipart/form-data)
    // Browser sets boundary automatically
  } else if (
    body &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams)
  ) {
    finalBody = JSON.stringify(body);
    if (!reqHeaders.has('Content-Type')) {
      reqHeaders.set('Content-Type', 'application/json');
    }
  }

  // Handle concurrency
  let mainSignal: AbortSignal | null = null;

  if (abortKey) {
    if (abortControllers.has(abortKey)) {
      abortControllers.get(abortKey)?.abort('Replacement request started');
    }
    const newController = new AbortController();
    abortControllers.set(abortKey, newController);
    mainSignal = newController.signal;
  } else if (reqOptions.signal) {
    mainSignal = reqOptions.signal;
  }

  const execute = async (attempt: number): Promise<RequestResult<T>> => {
    // Check if already aborted before starting this attempt
    if (mainSignal?.aborted) {
      return {
        data: null,
        response: null,
        error: { message: 'Request canceled', status: 'CANCELED' },
      };
    }

    try {
      // XHR fallback for upload progress
      if (onUploadProgress && method !== 'GET' && method !== 'HEAD') {
        return await xhrRequest(url, method, reqHeaders, finalBody, onUploadProgress);
      }

      // Native fetch with timeout and abortkey
      const attemptController = new AbortController();

      // Link main signal (abortKey) to this attempt's controller
      const onMainAbort = () => attemptController.abort();
      if (mainSignal) {
        mainSignal.addEventListener('abort', onMainAbort);
      }

      const timeoutId =
        timeout > 0 ? setTimeout(() => attemptController.abort(), timeout) : null;

      try {
        const response = await fetch(url, {
          method,
          headers: reqHeaders,
          body: finalBody,
          signal: attemptController.signal,
          ...reqOptions,
        });

        if (timeoutId) clearTimeout(timeoutId);

        // If the server is overloaded (503) or if rate-limited (429),
        // check the 'Retry-After' header to avoid further hammering the server.
        if (!response.ok && attempt < retry && [429, 503].includes(response.status)) {
          // Don't retry if it was explicitly aborted during the request
          if (mainSignal?.aborted) {
            throw new Error('Aborted');
          }

          const retryHeader = response.headers.get('Retry-After');
          let waitMs = 1000;

          // The Retry-After header can come in two formats: seconds or HTTP-Date
          if (retryHeader) {
            if (/^\d+$/.test(retryHeader)) {
              // Delay in seconds
              waitMs = parseInt(retryHeader, 10) * 1000;
            } else {
              // HTTP-Date (e.g. "Fri, 31 Dec 2024...")
              const date = Date.parse(retryHeader);
              if (!Number.isNaN(date)) {
                waitMs = date - Date.now();
              }
            }
          }

          // Time check (cap at 60s)
          // HTTP-Date could be in the past so ensure not below 0
          waitMs = Math.max(0, Math.min(waitMs, 60000));

          await new Promise((r) => setTimeout(r, waitMs));
          return execute(attempt + 1);
        }

        return await normalizeResponse(response);
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
      } finally {
        if (mainSignal) {
          mainSignal.removeEventListener('abort', onMainAbort);
        }
      }
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      // Distinguish between timeout and explicit cancel
      const status = isAbort
        ? mainSignal?.aborted
          ? 'CANCELED'
          : 'TIMEOUT'
        : 'NETWORK_ERROR';
      const message =
        status === 'TIMEOUT'
          ? 'Request timed out'
          : status === 'CANCELED'
            ? 'Request canceled'
            : err.message || 'Network Error';

      // Retry on network errors or timeouts (but not explicit cancels)
      if (attempt < retry && status !== 'CANCELED') {
        // Exponential backoff: 200ms, 400ms, 800ms... cap at 10s
        const backoff = Math.min(2 ** attempt * 200, 10000);
        await new Promise((r) => setTimeout(r, backoff));
        return execute(attempt + 1);
      }

      return {
        data: null,
        response: null,
        error: { message, status },
      };
    }
  };

  try {
    return await execute(0);
  } finally {
    // Cleanup abort key mapping only if this request owns it
    if (abortKey && abortControllers.get(abortKey)?.signal === mainSignal) {
      abortControllers.delete(abortKey);
    }
  }
}

/**
 * Normalizes a fetch response.
 */
async function normalizeResponse(response: Response): Promise<RequestResult> {
  let data: any = null;
  let error = null;

  try {
    // Safety check to make sure the body hasn't been consumed
    if (response.bodyUsed) {
      return {
        data: null,
        error: { message: 'Stream already consumed', status: 'INTERNAL_ERROR' },
        response,
      };
    }

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json') && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    data = null;
    error = { message: errorMessage, status: 'PARSE_ERROR' };
  }

  if (!response.ok) {
    error = {
      message: response.statusText || 'Request failed',
      status: response.status,
    };
  }

  return { data, error, response };
}

/**
 * XHR implementation for progress support.
 */
function xhrRequest(
  url: string,
  method: string,
  headers: Headers,
  body: any,
  onProgress: (ev: ProgressEvent) => void,
): Promise<RequestResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);

    headers.forEach((val, key) => {
      xhr.setRequestHeader(key, val);
    });

    if (xhr.upload) {
      xhr.upload.onprogress = onProgress;
    }

    xhr.onload = () => {
      const mockResponse = new Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new Headers({
          'Content-Type': xhr.getResponseHeader('Content-Type') || 'text/plain',
        }),
      });
      resolve(normalizeResponse(mockResponse));
    };

    xhr.onerror = () => {
      resolve({
        data: null,
        response: null,
        error: { message: 'Network Error', status: 'NETWORK_ERROR' },
      });
    };

    xhr.ontimeout = () => {
      resolve({
        data: null,
        response: null,
        error: { message: 'Request timed out', status: 'TIMEOUT' },
      });
    };

    xhr.send(body);
  });
}
