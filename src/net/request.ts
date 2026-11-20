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
import type { RouseApp } from '../app';
import type {
  FetchRequest,
  RequestError,
  ResolvedRequest,
  RouseResponse,
} from '../types';
import { preparePayload } from './payload';
import { errorResponse, mapCatchError, normalizeResponse } from './response';
import { getDirectiveValue } from '../core/elements';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue, safeJSONParse } from '../core/parser';
import { parseTime } from '../core/timing';

const abortRegistry = new Map<string | symbol, AbortController>();

/**
 * Issues a network request and normalizes the outcome.
 *
 * The single path every request Rouse makes goes through: the fetch engine and
 * `StoreSync._request` both route through it, which is what makes interceptors
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
    ...(triggerEl ? readRequest(triggerEl) : {}),
  };

  config.headers = {
    ...app.config.headers,
    ...(triggerEl ? readHeaders(triggerEl) : {}),
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

/**
 * Request headers for an element. Read by the network directives. Written as key-value
 * pairs, or as an inline JSON object. A `null` value removes the header from the
 * request; an empty string is sent as is. Values that contain a comma should be
 * wrapped in quotes.
 *
 * - `data-rz-headers="Tenant: 123"`
 * - `data-rz-headers="Rouse-Request: null"`
 * - `data-rz-headers="X-Blank: ''"`
 * - `data-rz-headers="Accept: 'text/html, application/json'"`
 * - `data-rz-headers='{ "Tenant": 123 }'`
 */
export function readHeaders(el: Element): Record<string, string | null> {
  const value = getDirectiveValue(el, 'headers');
  if (!value) return {};

  const headers: Record<string, string | null> = {};

  // Inline JSON
  if (value.startsWith('{')) {
    try {
      for (const [k, v] of Object.entries(safeJSONParse(value) as object)) {
        headers[k] = v == null ? null : String(v);
      }
    } catch {
      if (__DEV__) {
        warn(`rz-headers: value is not valid JSON: ${value}`, el);
      }
    }
    return headers;
  }

  // Static key-value pairs
  for (const [key, val] of parseDirectiveValue(value)) {
    if (val === null) {
      if (__DEV__) {
        warn(
          `rz-headers: header '${key}' has no value. Write '${key}: <value>', or '${key}: null' to remove it.`,
          el,
        );
      }
      continue;
    }
    // Treat 'null' as the deletion sentinel, mirroring programmatic null.
    headers[key] = val === 'null' ? null : val;
  }

  return headers;
}

/** How a config value is coerced. */
type ConfigValueType = 'string' | 'boolean' | 'duration';

/**
 * Keys `rz-request` accepts, and how each value is coerced. A key outside this
 * table warns and is dropped, so a typo or a key belonging to another directive
 * can't sit in a config doing nothing.
 *
 * Deliberately narrower than `RequestInit`: adding a key later is non-breaking,
 * removing one isn't. `method` belongs in the `rz-fetch` subject, `body` and `params`
 * in `rz-send` and the URL, and `skip-interceptors` in JS, where a bypass can't
 * silently drop auth from markup.
 */
const KEYS = {
  timeout: 'duration',
  'abort-key': 'string',
  credentials: 'string',
  keepalive: 'boolean',
  redirect: 'string',
  cache: 'string',
} as const satisfies Record<string, ConfigValueType>;

/**
 * Request options for the element's `rz-fetch`, written as `key: value` pairs.
 *
 * @example
 * <button data-rz-fetch="click: POST /save" data-rz-request="timeout: 5s, keepalive">
 */
function readRequest(el: Element): Partial<FetchRequest> {
  const value = getDirectiveValue(el, 'request');
  if (!value) return {};

  const config: Record<string, any> = {};

  for (const [key, rawVal] of parseDirectiveValue(value)) {
    const type = KEYS[key as keyof typeof KEYS];

    if (!type) {
      if (__DEV__) {
        warn(
          key === 'headers' || key === 'indicator'
            ? `rz-request: '${key}' belongs on data-rz-${key}. Ignoring.`
            : key === 'method'
              ? `rz-request: 'method' belongs in the data-rz-fetch subject, as in 'click: POST /save'. Ignoring.`
              : `rz-request: unknown key '${key}'. Ignoring.`,
          el,
        );
      }
      continue;
    }

    const val = rawVal ?? '';

    config[kebabToCamel(key)] =
      type === 'boolean'
        ? val === 'true' || val === ''
        : type === 'duration'
          ? parseTime(val)
          : val;
  }

  return config as Partial<FetchRequest>;
}

function kebabToCamel(str: string) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
