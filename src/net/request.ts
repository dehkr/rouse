import { defaultConfig, type RouseConfig } from '../core/app';
import { warn } from '../core/shared';
import type { RequestError, RouseRequest, RouseResponse } from '../types';
import { preparePayload } from './payload';
import { fallbackResponse, mapCatchError, normalizeResponse } from './response';

interface AbortEntry {
  controller: AbortController;
  ownerId: symbol;
}

const abortControllers = new Map<string | symbol, AbortEntry>();

/**
 * Handles Fetch/XHR switching, error normalization, retries, and interceptors.
 */
export async function request<T = any>(
  url: string,
  options: RouseRequest = {},
  appConfig: RouseConfig = defaultConfig,
): Promise<RouseResponse<T>> {
  let currentOptions = { ...options };
  const interceptors = appConfig.network?.interceptors || {};

  // Run request interceptor
  if (!currentOptions.skipInterceptors && interceptors.onRequest) {
    try {
      currentOptions = await interceptors.onRequest(currentOptions);
    } catch (e: unknown) {
      let errorPayload = mapCatchError(e, false);

      if (interceptors.onError) {
        errorPayload = await interceptors.onError(errorPayload, currentOptions);
      }

      return wrapErrorResponse(errorPayload, currentOptions);
    }
  }

  // Prepare payload (URL, headers, body)
  const { finalUrl, method, reqHeaders, finalBody, restOptions } = preparePayload(
    url,
    currentOptions,
    appConfig,
  );

  // Enforce no body on GET/HEAD
  let safeBody: BodyInit | null | undefined = finalBody;

  if ((method === 'GET' || method === 'HEAD') && safeBody != null) {
    warn('Body is not allowed on GET/HEAD. Dropping body.');
    safeBody = undefined;
  }

  // Extract Rouse-specific execution options
  const { retries = 0, timeout = 0, abortKey, triggerEl, ...fetchOptions } = restOptions;

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
  } else if (fetchOptions.signal) {
    mainSignal = fetchOptions.signal;
  }

  const execute = async (attempt: number): Promise<RouseResponse<T>> => {
    // Check if already aborted before starting this attempt
    if (mainSignal?.aborted) {
      return fallbackResponse(currentOptions, 'Request canceled', 'CANCELED');
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
        const response = await fetch(finalUrl, {
          method,
          headers: reqHeaders,
          signal: attemptController.signal,
          ...fetchOptions,
          ...(safeBody != null ? { body: safeBody } : {}),
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // If the server is overloaded (503) or if rate-limited (429),
        // check the 'Retry-After' header to avoid further hammering the server.
        if (!response.ok && attempt < retries && [429, 503].includes(response.status)) {
          // Don't retry if it was explicitly aborted during the request
          if (mainSignal?.aborted) {
            throw new Error('Aborted');
          }

          const retryHeader = response.headers.get('Retry-After');
          let waitMs = 1000;

          // The Retry-After header can come in two formats: seconds or HTTP-Date
          if (retryHeader) {
            if (/^\d+$/.test(retryHeader)) {
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

        const normalized = await normalizeResponse(response, currentOptions);

        // Run response/error interceptors
        if (!currentOptions.skipInterceptors) {
          if (normalized.error && interceptors.onError) {
            // Error (e.g. 404, 500, parse error)
            normalized.error = await interceptors.onError(
              normalized.error,
              currentOptions,
            );
          } else if (!normalized.error && interceptors.onResponse) {
            // Success (parsed data can safely be mutated)
            normalized.data = await interceptors.onResponse(
              normalized.data,
              normalized.response as Response,
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
      // Map native errors to CustomErrorStatus
      let errorPayload = mapCatchError(err, Boolean(mainSignal?.aborted));

      // Error interceptor
      if (!currentOptions.skipInterceptors && interceptors.onError) {
        errorPayload = await interceptors.onError(errorPayload, currentOptions);
      }

      // Retry on network errors or timeouts (but not explicit cancels)
      if (attempt < retries && errorPayload.status !== 'CANCELED') {
        // Exponential backoff: 200ms, 400ms, 800ms... cap at 10s
        const backoff = Math.min(2 ** attempt * 200, 10000);
        await new Promise((r) => setTimeout(r, backoff));
        return execute(attempt + 1);
      }

      return wrapErrorResponse(errorPayload, currentOptions);
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

// Wrap a RequestError into a RouseResponse
function wrapErrorResponse(error: RequestError, options: RouseRequest) {
  return {
    data: null,
    error: error,
    response: null,
    headers: null,
    status: null,
    config: options,
  };
}
