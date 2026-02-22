import type { RequestResult, RouseReqOpts } from '../types';
import { getClientConfig } from './config';
import { preparePayload } from './payload';
import { mapCatchError, normalizeResponse } from './response';
import { xhrRequest } from './xhr';

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
  options: RouseReqOpts = {},
): Promise<RequestResult<T>> {
  let currentOptions = { ...options };
  const config = getClientConfig();
  const ci = config.interceptors;

  // Run request interceptor
  if (!currentOptions.skipInterceptors && ci.onRequest) {
    try {
      currentOptions = await ci.onRequest(currentOptions);
    } catch (e) {
      if (ci.onError) {
        ci.onError(e, currentOptions);
      }
      throw e;
    }
  }

  // Prepare payload (URL, headers, body)
  const { finalUrl, method, reqHeaders, finalBody, restOptions } = preparePayload(
    url,
    currentOptions,
    config,
  );

  // Extract Rouse-specific execution options
  const {
    onUploadProgress,
    retry = 0,
    timeout = 0,
    abortKey,
    triggerEl,
    ...fetchOptions
  } = restOptions;

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
            ...fetchOptions,
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

        const normalized = await normalizeResponse(response);

        // Run response/error interceptors
        if (!currentOptions.skipInterceptors) {
          if (normalized.error && ci.onError) {
            // Error (e.g. 404, 500, parse error)
            ci.onError(normalized.error, currentOptions);
          } else if (!normalized.error && ci.onResponse) {
            // Success (parsed data can safely be mutated)
            normalized.data = await ci.onResponse(
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
      const errorPayload = mapCatchError(err, !!mainSignal?.aborted);

      // Error interceptor
      if (!currentOptions.skipInterceptors && ci.onError) {
        ci.onError(errorPayload, currentOptions);
      }

      // Retry on network errors or timeouts (but not explicit cancels)
      if (attempt < retry && errorPayload.status !== 'CANCELED') {
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
