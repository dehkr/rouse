import { defaultConfig, type RouseApp, type RouseConfig } from '../core/app';
import { warn } from '../core/shared';
import { rzHeaders } from '../directives/rz-headers';
import { rzRequest } from '../directives/rz-request';
import type { RequestError, RouseRequest, RouseResponse } from '../types';
import { preparePayload } from './payload';
import { fallbackResponse, mapCatchError, normalizeResponse } from './response';

interface AbortEntry {
  controller: AbortController;
  ownerId: symbol;
}

const abortRegistry = new Map<string | symbol, AbortEntry>();

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
    warn('Body is not allowed on GET or HEAD.');
    safeBody = undefined;
  }

  // Extract Rouse-specific execution options
  const {
    retry = 0,
    timeout = 0,
    abortKey,
    triggerEl,
    signal: externalSignal,
    method: _method,
    ...fetchOptions
  } = restOptions;

  let mainSignal: AbortSignal | null = null;
  let ownerId: symbol | null = null;

  // Handle concurrency and establish the primary abort signal
  if (abortKey) {
    abortRegistry.get(abortKey)?.controller.abort('Replacement request started');

    const controller = new AbortController();
    ownerId = Symbol('abort-owner');

    abortRegistry.set(abortKey, { controller, ownerId });
    mainSignal = controller.signal;
  } else if (externalSignal) {
    mainSignal = externalSignal;
  }

  let combinedSignal: AbortSignal;

  const signals = [mainSignal, timeout > 0 ? AbortSignal.timeout(timeout) : null].filter(
    (s): s is AbortSignal => s !== null,
  );

  combinedSignal =
    signals.length > 1 ? AbortSignal.any(signals) : (signals[0] ?? AbortSignal.any([]));

  const execute = async (attempt: number): Promise<RouseResponse<T>> => {
    if (combinedSignal.aborted) {
      const status = mainSignal?.aborted ? 'CANCELED' : 'TIMEOUT';
      return fallbackResponse(currentOptions, 'Request canceled or timed out', status);
    }

    try {
      const response = await fetch(finalUrl, {
        method,
        headers: reqHeaders,
        signal: combinedSignal,
        ...fetchOptions,
        ...(safeBody != null ? { body: safeBody } : {}),
      });

      // If the server is overloaded (503) or if rate-limited (429),
      // check the 'Retry-After' header to avoid further hammering the server.
      if (!response.ok && (response.status === 429 || response.status === 503)) {
        const delay = getRetryDelay(attempt, retry, currentOptions, response);
        if (delay !== null) {
          await cancellableDelay(delay, combinedSignal);
          return execute(attempt + 1);
        }
      }

      const normalized = await normalizeResponse(response, currentOptions);

      // Run response/error interceptors
      if (!currentOptions.skipInterceptors) {
        if (normalized.error && interceptors.onError) {
          normalized.error = await interceptors.onError(normalized.error, currentOptions);
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
      let errorPayload = mapCatchError(err, Boolean(mainSignal?.aborted));

      if (errorPayload.status !== 'CANCELED' && errorPayload.status !== 'TIMEOUT') {
        const delay = getRetryDelay(attempt, retry, currentOptions);
        if (delay !== null) {
          await cancellableDelay(delay, combinedSignal);
          return execute(attempt + 1);
        }
      }

      // Error interceptor runs on the final failure or explicit cancellation
      if (!currentOptions.skipInterceptors && interceptors.onError) {
        errorPayload = await interceptors.onError(errorPayload, currentOptions);
      }

      return wrapErrorResponse(errorPayload, currentOptions);
    }
  };

  try {
    return await execute(0);
  } finally {
    // Cleanup abort key mapping only if this request owns it
    if (abortKey && ownerId) {
      const entry = abortRegistry.get(abortKey);
      if (entry?.ownerId === ownerId) {
        abortRegistry.delete(abortKey);
      }
    }
  }
}

/**
 * Resolves the final network configuration by merging global and local config.
 */
export function resolveRequestConfig(
  el: Element,
  app: RouseApp | undefined,
): Partial<RouseRequest> {
  const globalConfig = app?.config.network.fetch || {};
  const localConfig = rzRequest.getConfig(el, app);

  return {
    ...globalConfig,
    ...localConfig,
    headers: {
      ...globalConfig.headers,
      ...localConfig.headers,
      ...rzHeaders.getConfig(el, app),
    },
  };
}

/**
 * Wrap a RequestError into a RouseResponse
 */
function wrapErrorResponse(error: RequestError, options: RouseRequest) {
  return {
    data: null,
    error,
    response: null,
    headers: null,
    status: null,
    config: options,
  };
}

/**
 * Parses a Retry-After header (seconds or HTTP-Date) into milliseconds.
 * Caps the maximum delay at 60 seconds.
 */
function parseRetryAfter(header: string | null): number {
  let waitMs = 1000;

  if (header) {
    if (/^\d+$/.test(header)) {
      waitMs = parseInt(header, 10) * 1000;
    } else {
      const date = Date.parse(header);
      if (!Number.isNaN(date)) {
        waitMs = date - Date.now();
      }
    }
  }

  return Math.max(0, Math.min(waitMs, 60000));
}

/**
 * Determines whether a failed request should be retried and how long to wait.
 * Returns the delay in ms, or null if the request should not be retried.
 */
function getRetryDelay(
  attempt: number,
  maxRetries: number,
  options: RouseRequest,
  response?: Response,
): number | null {
  if (attempt >= maxRetries) return null;

  // Server-driven delay from 429/503 Retry-After header takes precedence
  if (response && (response.status === 429 || response.status === 503)) {
    const serverDelay = response.headers.get('Retry-After');
    if (serverDelay) {
      return parseRetryAfter(serverDelay);
    }
  }

  // User-defined delay for network/catch errors
  const delayConfig = options.retryDelay ?? 1000;
  return typeof delayConfig === 'function' ? delayConfig(attempt) : delayConfig;
}

/**
 * Resolves a delay promise early if the provided signal is aborted.
 */
function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
