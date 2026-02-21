import type {
  CustomErrorStatus,
  NetworkInterceptors,
  RequestError,
  RequestResult,
  RouseReqOpts,
} from '../types';

let globalBaseUrl = '';
let globalHeaders: HeadersInit = {};
let interceptors: NetworkInterceptors = {};

interface AbortEntry {
  controller: AbortController;
  ownerId: symbol;
}

const abortControllers = new Map<string | symbol, AbortEntry>();

export function configureClient(config: {
  baseUrl?: string;
  headers?: HeadersInit;
  interceptors?: NetworkInterceptors;
}) {
  if (config.baseUrl) {
    globalBaseUrl = config.baseUrl.replace(/\/$/, '');
  }
  if (config.headers) {
    globalHeaders = { ...globalHeaders, ...config.headers };
  }
  if (config.interceptors) {
    interceptors = { ...interceptors, ...config.interceptors };
  }
}

/**
 * Handles Fetch/XHR switching, error normalization, retries, and response parsing.
 */
export async function request<T = any>(
  url: string,
  options: RouseReqOpts = {},
): Promise<RequestResult<T>> {
  let currentOptions = { ...options };

  // Run request interceptor
  if (!currentOptions.skipInterceptors && interceptors.onRequest) {
    try {
      currentOptions = await interceptors.onRequest(currentOptions);
    } catch (e) {
      if (interceptors.onError) {
        interceptors.onError(e, currentOptions);
      }
      throw e;
    }
  }

  // Extract Rouse-specific options so they don't get passed to native fetch()
  const {
    method = 'GET',
    headers = {},
    body,
    onUploadProgress,
    serializeForm,
    retry = 0,
    timeout = 0,
    abortKey,
    skipInterceptors,
    triggerEl,
    ...reqOptions
  } = currentOptions;

  let finalUrl = url;
  if (globalBaseUrl && !url.startsWith('http') && !url.startsWith('//')) {
    finalUrl = `${globalBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  const reqHeaders = new Headers(globalHeaders);
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

  // Handle concurrency
  let mainSignal: AbortSignal | null = null;
  let ownerId: symbol | null = null;

  if (abortKey) {
    if (abortControllers.has(abortKey)) {
      abortControllers.get(abortKey)?.controller.abort('Replacement request started');
    }

    const newController = new AbortController();
    const newOwnerId = Symbol('abort-owner');

    abortControllers.set(abortKey, { controller: newController, ownerId: newOwnerId });
    mainSignal = newController.signal;
    ownerId = newOwnerId;
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
      const attemptController = new AbortController();

      // Link main signal (abortKey) to this attempt's controller
      const onMainAbort = () => attemptController.abort();
      if (mainSignal) {
        mainSignal.addEventListener('abort', onMainAbort);
      }

      const timeoutId =
        timeout > 0 ? setTimeout(() => attemptController.abort(), timeout) : null;

      try {
        let response: Response;

        // Route through XHR or Fetch
        if (onUploadProgress && method !== 'GET' && method !== 'HEAD') {
          response = await xhrRequest(
            finalUrl,
            method,
            reqHeaders,
            finalBody,
            onUploadProgress,
            timeout,
            attemptController.signal,
          );
        } else {
          response = await fetch(finalUrl, {
            method,
            headers: reqHeaders,
            body: finalBody,
            signal: attemptController.signal,
            ...reqOptions,
          });
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

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

          // HTTP-Date could be in the past so ensure not below 0 and cap at 60s
          waitMs = Math.max(0, Math.min(waitMs, 60000));
          await new Promise((r) => setTimeout(r, waitMs));

          return execute(attempt + 1);
        }

        // Parses the JSON/HTML and flags HTTP errors
        const normalized = await normalizeResponse(response);

        // Run response interceptors
        if (!currentOptions.skipInterceptors) {
          if (normalized.error && interceptors.onError) {
            // Error (e.g. 404, 500, parse error)
            interceptors.onError(normalized.error, currentOptions);
          } else if (!normalized.error && interceptors.onResponse) {
            // Success (parsed data can safely be mutated)
            normalized.data = await interceptors.onResponse(
              normalized.data,
              currentOptions,
            );
          }
        }

        return normalized;
      } catch (err: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        throw err;
      } finally {
        if (mainSignal) {
          mainSignal.removeEventListener('abort', onMainAbort);
        }
      }
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';

      // Distinguish between timeout and explicit cancel
      const status: CustomErrorStatus = isAbort
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

      const errorPayload: RequestError = { message, status, original: err };

      // Error interceptor
      if (!currentOptions.skipInterceptors && interceptors.onError) {
        interceptors.onError(errorPayload, currentOptions);
      }

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
        error: errorPayload,
      };
    }
  };

  try {
    return await execute(0);
  } finally {
    // Cleanup abort key mapping only if this request owns it
    if (abortKey && ownerId) {
      const entry = abortControllers.get(abortKey);
      if (entry?.ownerId === ownerId) {
        abortControllers.delete(abortKey);
      }
    }
  }
}

/**
 * Normalizes a fetch response.
 */
async function normalizeResponse(response: Response): Promise<RequestResult> {
  let data: any = null;
  let error: RequestError | null = null;

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
    const contentType = response.headers.get('Content-Type') || '';

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
 * XHR implementation for progress support. Returns a mock Response.
 */
function xhrRequest(
  url: string,
  method: string,
  headers: Headers,
  body: any,
  onProgress: (ev: ProgressEvent) => void,
  timeout: number,
  signal: AbortSignal | null,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);

    if (timeout > 0) {
      xhr.timeout = timeout;
    }

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    // Helper to prevent memory leaks
    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    headers.forEach((val, key) => {
      xhr.setRequestHeader(key, val);
    });

    if (xhr.upload) {
      xhr.upload.onprogress = onProgress;
    }

    xhr.onload = () => {
      cleanup();
      resolve(
        new Response(xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: new Headers({
            'Content-Type': xhr.getResponseHeader('Content-Type') || 'text/plain',
          }),
        }),
      );
    };

    xhr.onerror = () => {
      cleanup();
      reject(new TypeError('Network Error'));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new DOMException('Request timed out', 'AbortError'));
    };

    xhr.send(body);
  });
}
