import type { RouseApp } from '../core/app';
import { isSafeMethod } from '../core/constants';
import { rzHeaders } from '../directives/rz-headers';
import { rzRequest } from '../directives/rz-request';
import type { FetchRequest, RequestError, RouseResponse } from '../types';
import { preparePayload } from './payload';
import {
  errorResponse,
  fallbackResponse,
  mapCatchError,
  normalizeResponse,
} from './response';

const abortRegistry = new Map<string | symbol, AbortController>();

/**
 * Issues a network request and normalizes the outcome.
 *
 * The single path every request Rouse makes goes through: the fetch engine and
 * `StoreManager._request` both route through it, which is what makes interceptors
 * apply uniformly (`skipInterceptors` is the per-call opt-out). Handles payload
 * serialization, `abortKey` concurrency, timeouts, and response normalization.
 *
 * The URL is read from `config.url` after the request interceptors run, so a `:config`
 * listener or an interceptor can retarget the request. `config` is the caller's object,
 * mutated in place and carried on `response.config`.
 *
 * A safe request (`GET`, `HEAD`, `OPTIONS`, `QUERY`) that fails before any HTTP
 * response arrives is retried once, immediately. That covers a dropped keep-alive
 * socket or a network handoff, where nothing reached the server and so nothing can
 * be duplicated. The retry happens below the lifecycle and above the error chain, so
 * one failure still produces one terminal event and one interceptor pass. `TIMEOUT`
 * and `CANCELED` are never retried, and neither is any other method.
 */
export async function request<T = any>(
  config: FetchRequest,
  app: RouseApp,
): Promise<RouseResponse<T>> {
  if (!config.skipInterceptors) {
    try {
      // Merged rather than replaced, so every event and interceptor shares one config
      for (const fn of app._interceptors.request) {
        Object.assign(config, await fn(config));
      }
    } catch (e: unknown) {
      const error = await runErrorInterceptors(mapCatchError(e, false), config, app);
      return errorResponse(config, error);
    }
  }

  const { finalUrl, method, reqHeaders, finalBody, restOptions } = preparePayload(
    config,
    app.config.baseUrl,
  );

  // Extract Rouse-specific execution options
  const {
    timeout = 0,
    abortKey,
    triggerEl: _triggerEl,
    signal: externalSignal,
    method: _method,
    ...fetchOptions
  } = restOptions;

  let controller: AbortController | null = null;

  // Handle concurrency and establish the primary abort signal
  if (abortKey) {
    abortRegistry.get(abortKey)?.abort('Replacement request started');
    controller = new AbortController();
    abortRegistry.set(abortKey, controller);
  }

  const mainSignal = controller?.signal ?? externalSignal ?? null;

  const signals = [mainSignal, timeout > 0 ? AbortSignal.timeout(timeout) : null].filter(
    (s): s is AbortSignal => s !== null,
  );

  const combinedSignal = AbortSignal.any(signals);

  const execute = async (attempt = 0): Promise<RouseResponse<T>> => {
    if (combinedSignal.aborted) {
      const status = mainSignal?.aborted ? 'CANCELED' : 'TIMEOUT';
      return fallbackResponse(config, 'Request canceled or timed out', status);
    }

    let responded = false;

    try {
      const response = await fetch(finalUrl, {
        method,
        headers: reqHeaders,
        signal: combinedSignal,
        ...fetchOptions,
        ...(finalBody != null ? { body: finalBody } : {}),
      });
      responded = true;

      const normalized = await normalizeResponse(response, config);

      // Run response/error interceptors
      if (!config.skipInterceptors) {
        if (normalized.error) {
          normalized.error = await runErrorInterceptors(normalized.error, config, app);
        } else {
          for (const fn of app._interceptors.response) {
            normalized.data = await fn(
              normalized.data,
              normalized.response as Response,
              config,
            );
          }
        }
      }
      return normalized;
    } catch (err: any) {
      let errorPayload = mapCatchError(err, !!mainSignal?.aborted);

      // One immediate retry for safe methods. `!responded` is what makes this a
      // transport check: NETWORK_ERROR is `mapCatchError`'s fallback for any non-abort
      // throw, including one from a response interceptor, which must not re-send.
      // TIMEOUT and CANCELED are excluded since both are deadlines someone set on purpose.
      if (
        !responded &&
        attempt === 0 &&
        errorPayload.code === 'NETWORK_ERROR' &&
        isSafeMethod(method)
      ) {
        return execute(attempt + 1);
      }

      // Error interceptors run on the final failure or explicit cancellation
      if (!config.skipInterceptors) {
        errorPayload = await runErrorInterceptors(errorPayload, config, app);
      }
      return errorResponse(config, errorPayload);
    }
  };

  try {
    return await execute();
  } finally {
    // Cleanup abort key mapping only if this request owns it
    if (abortKey && abortRegistry.get(abortKey) === controller) {
      abortRegistry.delete(abortKey);
    }
  }
}

/**
 * Resolves the final network configuration for a fetch by merging app-level
 * defaults with directive-driven config layers in priority order (later wins):
 *
 *   1. global defaults (`app.config.*`)
 *   2. `rz-request` and `rz-headers` on the triggering element
 *
 * Headers follow the same chain, merged separately so per-key overrides win
 * without losing unrelated header keys from earlier layers.
 *
 * A `null` `triggerEl` is a programmatic request with no originating element:
 * only the global layer applies. Push and pull do not come through here — their
 * config lives on the store.
 */
export function resolveRequestConfig(
  triggerEl: Element | null,
  app: RouseApp,
): Partial<FetchRequest> {
  const config: Partial<FetchRequest> = {
    credentials: app.config.credentials,
    timeout: app.config.timeout,
    ...(triggerEl ? rzRequest.getConfig(triggerEl) : {}),
  };

  config.headers = {
    ...app.config.headers,
    ...(triggerEl ? rzHeaders.getConfig(triggerEl) : {}),
  };

  return config;
}

/**
 * Runs the error interceptors in order, each receiving the previous one's result.
 */
async function runErrorInterceptors(
  error: RequestError,
  config: FetchRequest,
  app: RouseApp,
): Promise<RequestError> {
  for (const fn of app._interceptors.error) {
    error = await fn(error, config);
  }
  return error;
}
