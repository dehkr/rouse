/*
 * `config.url` is the URL that's sent, and the config is one object, with each request
 * interceptor's return merged into it. Don't add `url` or `method` copies to event
 * details, or a URL parameter here: a second copy is a value a listener can change to
 * no effect. `url` stays a string, since a `URL`'s `searchParams` would be a second
 * query string beside `params`.
 *
 * `ResolvedRequest` is the one transport type for fetch, push, and pull. The authoring
 * types (`FetchRequest`, `SyncRequest`) split above this line; never parameterize
 * `request()` or the interceptors by operation.
 *
 * `skipInterceptors` stays programmatic, since a bypass written in markup silently
 * drops what the chain adds, such as auth headers.
 */
import type { RouseApp } from '../core/app';
import { rzHeaders } from '../directives/rz-headers';
import { rzRequest } from '../directives/rz-request';
import type {
  FetchRequest,
  RequestError,
  ResolvedRequest,
  RouseResponse,
} from '../types';
import { preparePayload } from './payload';
import { errorResponse, mapCatchError, normalizeResponse } from './response';

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
 */
export async function request<T = any>(
  config: ResolvedRequest,
  app: RouseApp,
): Promise<RouseResponse<T>> {
  if (!config.skipInterceptors) {
    try {
      // Merged rather than replaced, so every event and interceptor shares one config
      for (const fn of app._interceptors.request) {
        Object.assign(config, await fn(config));
      }
    } catch (e: unknown) {
      const error = await runErrorInterceptors(mapCatchError(e), config, app);
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

  // Both cancel: a replacement request aborts through the key, and the caller's
  // `signal` (a scope's `term`) must still end a keyed request
  const cancelSignals = [controller?.signal, externalSignal].filter(
    (s): s is AbortSignal => s != null,
  );
  const isCanceled = () => cancelSignals.some((s) => s.aborted);

  const combinedSignal = AbortSignal.any(
    timeout > 0 ? [...cancelSignals, AbortSignal.timeout(timeout)] : cancelSignals,
  );

  try {
    const response = await fetch(finalUrl, {
      method,
      headers: reqHeaders,
      signal: combinedSignal,
      ...fetchOptions,
      ...(finalBody != null ? { body: finalBody } : {}),
    });

    const normalized = await normalizeResponse(response, config);

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
  } catch (err: unknown) {
    // Classified by signal state, not the thrown value: `fetch` rejects with the
    // signal's abort reason, which is a plain string for a replaced request
    const abortCode = isCanceled()
      ? 'CANCELED'
      : combinedSignal.aborted
        ? 'TIMEOUT'
        : null;
    let errorPayload = mapCatchError(err, abortCode);

    if (!config.skipInterceptors) {
      errorPayload = await runErrorInterceptors(errorPayload, config, app);
    }
    return errorResponse(config, errorPayload);
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
  config: ResolvedRequest,
  app: RouseApp,
): Promise<RequestError> {
  for (const fn of app._interceptors.error) {
    error = await fn(error, config);
  }
  return error;
}
