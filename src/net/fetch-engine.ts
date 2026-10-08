import type { RouseApp } from '../core/app';
import { hasDirective } from '../core/attributes';
import { isSafeMethod } from '../core/constants';
import { err, warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { createKey } from '../core/keys';
import { isPlainObject } from '../core/state';
import { rzSend } from '../directives/rz-send';
import { readTriggerValues } from '../dom/forms';
import type { FetchRequest, RouseResponse } from '../types';
import { type LifecycleHandle, PREVENTED, runRequestLifecycle } from './lifecycle';
import { request, resolveRequestConfig } from './request';
import { fallbackResponse, isFileType, isJsonType } from './response';

const abortKeys = new WeakMap<Element, string>();
const writesInFlight = new Set<string | symbol>();

/**
 * Runs a fetch. Resolves the URL and merged request config, drives the `rz:fetch:*`
 * lifecycle, and routes the response payload. A failure comes back as a `RouseResponse`
 * carrying an error.
 *
 * `options.triggerEl` is the element the request originates from, set by the declarative
 * path. It gates everything element-derived: config attributes, field extraction, the
 * disabled guard, and the abort key. It's the node the lifecycle events fire from. A
 * programmatic fetch doesn't have a triggerEl, but it can be set manually via config.
 *
 * A request never aborts a write. While a write is in flight under an abort key, new
 * requests under that key are dropped. The key is the element's own unless one is set
 * explicitly, so elements sharing a key share the guard.
 *
 * `options.submitter` is the button that submitted a form trigger. Its `formaction`,
 * `formmethod`, and `formenctype` override the form's, and its value joins the form's
 * fields. It's ignored on any other trigger.
 */
export async function runFetch(
  app: RouseApp,
  options: FetchRequest,
): Promise<RouseResponse> {
  const triggerEl = options.triggerEl ?? null;
  // Lifecycle events always need a node to fire from, triggerEl or not
  const hostEl = triggerEl ?? app.root;

  try {
    if (triggerEl) {
      // A debounced or queued trigger can fire after the element is gone
      if (!triggerEl.isConnected) {
        abortKeys.delete(triggerEl);
        return fallbackResponse(options, 'Element disconnected from DOM');
      }

      // Bail out if disabled
      if (
        triggerEl.hasAttribute('disabled') ||
        triggerEl.getAttribute('aria-disabled') === 'true'
      ) {
        return fallbackResponse(options, 'Element is disabled');
      }
    }

    // Only a form has a submitter, and its attributes beat the form's own
    const submitter =
      triggerEl instanceof HTMLFormElement ? (options.submitter ?? null) : null;

    const url = resolveUrl(
      triggerEl,
      submitter?.getAttribute('formaction') ?? options.url,
    );
    if (!url) {
      return fallbackResponse(
        options,
        'Invalid or missing URL for the fetch request.',
        'INTERNAL_ERROR',
      );
    }

    const finalRequestInit = resolveRequestConfig(triggerEl, app);
    const formMethod =
      triggerEl instanceof HTMLFormElement ? triggerEl.getAttribute('method') : undefined;

    // Prioritization: submitter > rz-fetch > rz-request > form attribute > 'GET'
    const method = (
      submitter?.getAttribute('formmethod') ||
      options.method ||
      finalRequestInit.method ||
      formMethod ||
      'GET'
    ).toUpperCase();

    // No `triggerEl` means no element to key on, so a programmatic caller opts
    // into deduping by setting the `abortKey` option.
    const abortKey =
      options.abortKey ||
      finalRequestInit.abortKey ||
      (triggerEl ? getAbortKey(triggerEl) : undefined);

    // The server may have already acted on a write, so aborting it can't undo anything
    // and only discards the response. Requests under its key wait for it to settle instead.
    if (abortKey && writesInFlight.has(abortKey)) {
      return fallbackResponse(options, 'A write is in flight for this abort key');
    }

    // Programmatic headers merge per key with the resolved declarative layers,
    // matching how those layers combine with each other. `null` removes one.
    const headers: RequestHeaders = { ...finalRequestInit.headers, ...options.headers };

    // An explicit body is the whole body, so the element contributes nothing
    const hasExplicitBody = options.body !== undefined;
    const payload =
      triggerEl && !hasExplicitBody
        ? resolvePayload(triggerEl, submitter, method, headers, app)
        : {};

    __DEV__ &&
      triggerEl &&
      hasExplicitBody &&
      hasDirective(triggerEl, 'send') &&
      warn('rz-send: ignored because a body was passed to app.fetch().', triggerEl);

    // Final unified config object
    const finalOptions: FetchRequest = {
      ...finalRequestInit,
      ...options,
      ...payload,
      url,
      method,
      // A multipart body replaces the headers to drop a declared Content-Type
      headers: payload.headers ?? headers,
      // Params merge per key like headers, so a programmatic param can override one
      // value from the element without discarding the rest
      params: { ...payload.params, ...options.params },
      abortKey,
    };

    const outcome = await runRequestLifecycle({
      el: hostEl,
      root: app.root,
      prefix: 'rz:fetch',
      configDetail: { config: finalOptions, url, method },
      terminalDetail: (result) => result,
      run: async (handle) => {
        // Read from the config, since a `:config` listener can change the method or key.
        // A key that is already marked belongs to another write, and that write unmarks it.
        const key = finalOptions.abortKey;
        const marked =
          key && !isSafeMethod(finalOptions.method) && !writesInFlight.has(key)
            ? key
            : null;

        if (marked) {
          writesInFlight.add(marked);
        }

        try {
          return await sendAndRoute(hostEl, triggerEl, url, finalOptions, app, handle);
        } finally {
          if (marked) {
            writesInFlight.delete(marked);
          }
        }
      },
    });

    return outcome === PREVENTED
      ? fallbackResponse(finalOptions, 'Prevented by rz:fetch:config listener')
      : outcome;
  } catch (error: any) {
    err(`Error executing fetch:`, ...(triggerEl ? [triggerEl] : []), error);

    return fallbackResponse(options, error.message || 'Internal error', 'INTERNAL_ERROR');
  }
}

/**
 * Sends the request and routes what comes back: server-directed redirects and
 * URL changes first, then the payload to its typed sub-event. Events fire from
 * `hostEl`; `triggerEl` is used only for abort-key bookkeeping.
 */
async function sendAndRoute(
  hostEl: Element,
  triggerEl: Element | null,
  url: string,
  options: FetchRequest,
  app: RouseApp,
  handle: LifecycleHandle,
): Promise<RouseResponse> {
  try {
    const result = await request(url, options, app);
    const rouseHeaders = extractRouseHeaders(result.headers);

    if (rouseHeaders.redirect) {
      followRedirect(triggerEl, rouseHeaders.redirect);
      return result;
    }

    // Native browser-followed redirect (e.g., expired session -> login page).
    // Server intent via Rouse-Redirect wins. Falls through to the redirected
    // short-circuit in the error block below.
    if (result.response?.redirected) {
      if (isSameOrigin(result.response.url)) {
        followRedirect(triggerEl, result.response.url);
        return result;
      }
      __DEV__ && warn(`Cross-origin redirect blocked: '${result.response.url}'.`);
      result.error = {
        message: 'Cross-origin redirect blocked',
        code: 'REDIRECTED',
      };
    }

    applyUrlChange(rouseHeaders.pushUrl, rouseHeaders.replaceUrl);

    if (rouseHeaders.place) {
      result.placeOverride = rouseHeaders.place;
    }
    if (rouseHeaders.deposit) {
      result.depositOverride = rouseHeaders.deposit;
    }

    handle.settle(result);

    if (result.error) {
      const { code } = result.error;
      if (code !== 'CANCELED' && code !== 'REDIRECTED' && result.response) {
        routePayload(hostEl, result, 'error');
      }
      return result;
    }
    if (result.response) {
      routePayload(hostEl, result, 'success');
    }
    return result;
  } catch (error: any) {
    // If a request throws before returning, listeners would see `:start` then `:end`,
    // without a terminal `:abort`/`:success`/`:error` event in between. So settle
    // here to fulfill the lifecycle contract.
    err('Fetch failed unexpectedly.', hostEl, error);

    const fallback = fallbackResponse(
      options,
      error.message || 'Internal Error',
      'INTERNAL_ERROR',
    );
    handle.settle(fallback);
    return fallback;
  }
}

/**
 * Returns the request URL. Warns against `el` and returns `null` when there is none.
 */
function resolveUrl(el: Element | null, url: string | undefined): string | null {
  if (!url) {
    __DEV__ && warn('Invalid or missing URL for the fetch request.', ...(el ? [el] : []));
    return null;
  }

  return url;
}

type QueryParams = NonNullable<FetchRequest['params']>;
type RequestHeaders = NonNullable<FetchRequest['headers']>;
type Encoding = 'json' | 'urlencoded' | 'multipart';
type FormPair = [string, string | File];

/**
 * Builds what the element sends: its `rz-send` payload when it has one, else its own
 * field or form. GET and HEAD carry it as query parameters. Other methods carry it as
 * a body, encoded as declared.
 */
function resolvePayload(
  el: Element,
  submitter: HTMLElement | null,
  method: string,
  headers: RequestHeaders,
  app: RouseApp,
): Partial<FetchRequest> {
  const payload = hasDirective(el, 'send')
    ? rzSend.getConfig(el, app, submitter)
    : readTriggerValues(el, submitter);
  if (!payload) {
    return {};
  }

  if (method === 'GET' || method === 'HEAD') {
    return { params: toParams(toFormPairs(payload, el, false)) };
  }

  const encoding = resolveEncoding(el, submitter, headers);
  if (encoding === 'json') {
    return { body: dropFiles(payload, el) };
  }

  const pairs = toFormPairs(payload, el, encoding === 'multipart');
  if (encoding === 'urlencoded') {
    return { body: new URLSearchParams(pairs as [string, string][]) };
  }

  // A multipart Content-Type needs a boundary, and fetch only writes one when it
  // sets the header itself
  const body = new FormData();
  pairs.forEach(([key, val]) => body.append(key, val));
  return { body, headers: withoutContentType(headers) };
}

/**
 * Resolves the body encoding from its declaration: a Content-Type header, then the
 * submitter's `formenctype` and the form's `enctype`, then the native default.
 */
function resolveEncoding(
  el: Element,
  submitter: HTMLElement | null,
  headers: RequestHeaders,
): Encoding {
  const declared = declaredContentType(headers);

  if (declared) {
    const mime = declared.replace(/;.*$/s, '').trim().toLowerCase();
    if (isJsonType(mime)) {
      return 'json';
    }
    if (mime === 'multipart/form-data') {
      return 'multipart';
    }
    __DEV__ &&
      mime !== 'application/x-www-form-urlencoded' &&
      warn(
        `Content-Type '${declared}' isn't an encoding Rouse can build. Sending form data under it.`,
        el,
      );
    return 'urlencoded';
  }

  if (!(el instanceof HTMLFormElement)) {
    return 'urlencoded';
  }

  // Both properties reflect a normalized value, so an unknown encoding reads as urlencoded
  const enctype =
    (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
    submitter.hasAttribute('formenctype')
      ? submitter.formEnctype
      : el.enctype;

  return enctype === 'multipart/form-data' ? 'multipart' : 'urlencoded';
}

/**
 * Reads the Content-Type the headers will send. Keys match without case, and a later
 * key wins, as it does when the headers are applied.
 */
function declaredContentType(headers: RequestHeaders): string | null {
  let type: string | null = null;
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      type = val;
    }
  }
  return type;
}

/** Returns `headers` with every spelling of Content-Type removed. */
function withoutContentType(headers: RequestHeaders): RequestHeaders {
  return Object.fromEntries(
    Object.entries(headers).map(([key, val]) => [
      key,
      key.toLowerCase() === 'content-type' ? null : val,
    ]),
  );
}

/**
 * Flattens a payload into form pairs. A list becomes repeated keys, and numbers and
 * booleans become strings. A nested object can't be expressed and is dropped. A file
 * survives only when `keepFiles` is set; otherwise it contributes its name, as a
 * native form without a multipart encoding does.
 */
function toFormPairs(
  payload: Record<string, unknown>,
  el: Element,
  keepFiles: boolean,
): FormPair[] {
  return Object.entries(payload).flatMap(([key, val]) =>
    (Array.isArray(val) ? val : [val]).flatMap((item): FormPair[] => {
      if (item == null) {
        return [];
      }
      if (item instanceof File) {
        if (keepFiles) {
          return [[key, item]];
        }
        __DEV__ &&
          warn(
            `File in '${key}' needs a multipart encoding to be sent. Sending its name.`,
            el,
          );
        return [[key, item.name]];
      }
      if (typeof item === 'object') {
        __DEV__ &&
          warn(`'${key}' holds an object, which form data can't carry. Ignoring it.`, el);
        return [];
      }
      return [[key, String(item)]];
    }),
  );
}

/** Groups flattened pairs into query parameters, one list per key. */
function toParams(pairs: FormPair[]): QueryParams {
  const params: Record<string, string[]> = {};
  pairs.forEach(([key, val]) => {
    params[key] ??= [];
    params[key].push(String(val));
  });
  return params;
}

/**
 * Removes files from a JSON payload, since JSON can't carry one. Each removal warns,
 * because the file's contents are lost.
 */
function dropFiles(
  payload: Record<string, unknown>,
  el: Element,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).flatMap(([key, val]): [string, unknown][] => {
      const items = Array.isArray(val) ? val : [val];
      if (!items.some((item) => item instanceof File)) {
        return [[key, val]];
      }

      __DEV__ && warn(`File in '${key}' can't be sent as JSON. Ignoring it.`, el);
      const rest = items.filter((item) => !(item instanceof File));
      return Array.isArray(val) && rest.length ? [[key, rest]] : [];
    }),
  );
}

/** Navigates to a server-directed redirect target. */
function followRedirect(el: Element | null, url: string): void {
  if (el) {
    abortKeys.delete(el);
  }
  window.location.assign(url);
}

/**
 * Returns the element's abort key, generating one on first use so an element can
 * never have conflicting requests in the air.
 */
function getAbortKey(el: Element): string {
  let key = abortKeys.get(el);

  if (!key) {
    key = createKey('rz_abort_');
    abortKeys.set(el, key);
  }

  return key;
}

/**
 * Dispatches the typed payload sub-event (`:file` / `:json` / `:html`) under the
 * given `rz:fetch:{success,error}` prefix, driving JSON and HTML routing.
 */
function routePayload(hostEl: Element, result: RouseResponse, type: 'success' | 'error') {
  const data = result.data;
  // A server removing an element usually sends no body, which leaves nothing to
  // classify. `Rouse-Place` names the placement by itself, so an empty body that
  // carries it routes as HTML.
  const kind = data == null && result.placeOverride ? 'html' : payloadKind(data);

  if (kind === null) {
    // Ignore null/undefined (e.g., 204 No Content), but warn on unhandled complex types
    if (__DEV__ && data != null) {
      warn(`Unsupported payload: '${data?.constructor?.name || typeof data}'.`);
    }
    return;
  }

  // Each router reads only its own override, so a header aimed at the other
  // router would otherwise be dropped without a trace.
  if (__DEV__ && result.placeOverride && kind !== 'html') {
    warn(
      `Rouse-Place applies only to HTML responses, but this one was routed as ${kind === 'json' ? 'JSON' : 'a file'}. Ignoring it.`,
      hostEl,
    );
  }
  if (__DEV__ && result.depositOverride && kind !== 'json') {
    warn(
      `Rouse-Deposit applies only to JSON responses, but this one was routed as ${kind === 'html' ? 'HTML' : 'a file'}. Ignoring it.`,
      hostEl,
    );
  }

  if (__DEV__ && typeof data === 'string') {
    const contentType = result.response?.headers.get('Content-Type') || '';
    if (isJsonType(contentType)) {
      warn(`Content-Type is JSON but data is a string. Defaulting to HTML.`);
    }
  }

  dispatch(hostEl, `rz:fetch:${type}:${kind}`, result);
}

/** Classifies a response body by the router that handles it. */
function payloadKind(data: unknown): 'file' | 'json' | 'html' | null {
  if (isFileType(data)) {
    return 'file';
  }
  // The store router needs parsed objects to merge state
  if (Array.isArray(data) || isPlainObject(data)) {
    return 'json';
  }
  if (typeof data === 'string') {
    return 'html';
  }

  return null;
}

/**
 * Extracts the server-driven flow-control headers the fetch engine acts on.
 *
 * `Rouse-Trigger` is deliberately absent: it is consumed by `runRequestLifecycle`
 * for all three request families (fetch, push, pull), not just fetch.
 */
function extractRouseHeaders(headers: Record<string, string> | null) {
  return {
    redirect: headers?.['rouse-redirect'] || null,
    place: headers?.['rouse-place'] || null,
    deposit: headers?.['rouse-deposit'] || null,
    pushUrl: headers?.['rouse-push-url'] || null,
    replaceUrl: headers?.['rouse-replace-url'] || null,
  };
}

/**
 * Applies a server-directed URL change via history.pushState / replaceState.
 * Rejects cross-origin URLs to defend against a compromised backend.
 */
function applyUrlChange(pushUrl: string | null, replaceUrl: string | null): void {
  const url = pushUrl ?? replaceUrl;
  if (url === null) return;

  __DEV__ &&
    pushUrl &&
    replaceUrl &&
    warn(`Both 'Rouse-Push-Url' and 'Rouse-Replace-Url' present. Using Push.`);

  if (!isSameOrigin(url)) {
    const headerName = pushUrl ? 'Rouse-Push-Url' : 'Rouse-Replace-Url';
    __DEV__ && warn(`'${headerName}' rejected: cross-origin URL '${url}'.`);
    return;
  }

  const method = pushUrl ? 'pushState' : 'replaceState';

  try {
    history[method]({}, '', url);
  } catch (error) {
    __DEV__ && warn(`${method} failed for URL '${url}'.`, error);
  }
}

/**
 * Resolves `url` against the document and compares origins. Malformed URLs
 * are not same-origin.
 */
function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}
