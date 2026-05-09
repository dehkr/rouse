import { defaultConfig, type RouseApp, type RouseConfig } from '../core/app';
import { warn } from '../core/shared';
import {
  rzHeaders,
  rzHeadersFetch,
  rzHeadersRefresh,
  rzHeadersSave,
} from '../directives/rz-headers';
import {
  rzRequest,
  rzRequestFetch,
  rzRequestRefresh,
  rzRequestSave,
} from '../directives/rz-request';
import type { NetworkAction, RequestError, RouseRequest, RouseResponse } from '../types';
import { preparePayload } from './payload';
import { fallbackResponse, mapCatchError, normalizeResponse } from './response';

interface AbortEntry {
  controller: AbortController;
  ownerId: symbol;
}

const REQUEST_VARIANTS = {
  fetch: rzRequestFetch,
  save: rzRequestSave,
  refresh: rzRequestRefresh,
} as const;

const HEADERS_VARIANTS = {
  fetch: rzHeadersFetch,
  save: rzHeadersSave,
  refresh: rzHeadersRefresh,
} as const;

const abortRegistry = new Map<string | symbol, AbortEntry>();

/**
 * A wrapper for the Fetch API providing request orchestration, including:
 *
 *   - Request, response, and error interceptors
 *   - Automatic payload serialization (JSON, FormData, URL parameters)
 *   - Concurrency management and cancellation via `abortKey`
 *   - Absolute global request timeouts
 *   - Configurable retries with custom delays and native 429/503 `Retry-After` support
 *   - Automatic response normalization (JSON, Text, Blob)
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
 * Resolves the final network configuration by merging app-level defaults with
 * directive-driven config layers in priority order (later wins):
 *
 *   1. global defaults (`app.config.network.fetch`)
 *   2. `rz-request` on target element (save/refresh only)
 *   3. `rz-request-<action>` on target element (save/refresh only)
 *   4. `rz-request` on triggering element
 *   5. `rz-request-<action>` on triggering element
 *
 * Headers follow the same chain, merged separately so per-key overrides win
 * without losing unrelated header keys from earlier layers.
 *
 * `targetEl` applies to save/refresh, where the action is initiated by one
 * element but configured on another (the store's owning element).
 */
export function resolveRequestConfig(
  triggeringEl: Element,
  action: NetworkAction,
  app?: RouseApp,
  targetEl?: Element,
): Partial<RouseRequest> {
  const globalConfig = app?.config.network.fetch || {};
  const requestVariant = REQUEST_VARIANTS[action];
  const headersVariant = HEADERS_VARIANTS[action];

  const layers: Partial<RouseRequest>[] = [];
  const headerLayers: (Record<string, string> | undefined)[] = [];

  const addLayer = (cfg: Partial<RouseRequest>) => {
    layers.push(cfg);
    if (cfg.headers) {
      headerLayers.push(cfg.headers as Record<string, string>);
    }
  };

  const addHeaders = (hdrs: Record<string, string>) => {
    if (Object.keys(hdrs).length > 0) {
      headerLayers.push(hdrs);
    }
  };

  addLayer(globalConfig);

  if (targetEl && targetEl !== triggeringEl) {
    addLayer(rzRequest.getConfig(targetEl, app));
    addHeaders(rzHeaders.getConfig(targetEl, app));
    addLayer(requestVariant.getConfig(targetEl, app));
    addHeaders(headersVariant.getConfig(targetEl, app));
  }

  addLayer(rzRequest.getConfig(triggeringEl, app));
  addHeaders(rzHeaders.getConfig(triggeringEl, app));
  addLayer(requestVariant.getConfig(triggeringEl, app));
  addHeaders(headersVariant.getConfig(triggeringEl, app));

  const merged = Object.assign({}, ...layers) as Partial<RouseRequest>;
  merged.headers = Object.assign({}, ...headerLayers);

  return merged;
}

/**
 * Wrap a `RequestError` into a `RouseResponse`.
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
