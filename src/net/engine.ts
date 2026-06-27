import type { RouseApp } from '../core/app';
import {
  err,
  isFileType,
  isJsonType,
  isPlainObject,
  uniqueKey,
  warn,
} from '../core/shared';
import { resolveStoreUrl } from '../core/store';
import { extractFieldValues } from '../dom/forms';
import { dispatch } from '../dom/scheduler';
import { is } from '../dom/utils';
import type { RouseRequest, RouseResponse } from '../types';
import { extractRouseHeaders } from './headers';
import { request, resolveRequestConfig } from './request';
import { fallbackResponse } from './response';

type RequestState = { abortKey?: string };

const activeRequests = new WeakMap<Element, RequestState>();

/**
 * Handles the preparation, pacing, and execution of a network request.
 */
export async function handleFetch(
  el: Element,
  app: RouseApp,
  programmaticOpts: RouseRequest = {},
): Promise<RouseResponse> {
  let state = activeRequests.get(el);
  if (!state) {
    state = {};
    activeRequests.set(el, state);
  }

  try {
    return await executeFetch(el, app, programmaticOpts);
  } catch (error: any) {
    err(`Error executing fetch on element:`, el, error);

    return fallbackResponse(
      programmaticOpts,
      error.message || 'Internal error',
      'INTERNAL_ERROR',
    );
  }
}

/**
 * Handles the complete lifecycle of a network request once timing
 * conditions (throttle/debounce) have been satisfied.
 *
 * @param el - The DOM element triggering the network request.
 * @param options - The sanitized request config passed to the network orchestrator.
 */
async function executeFetch(el: Element, app: RouseApp, options: RouseRequest) {
  const state = activeRequests.get(el);
  const isFormEl = is(el, 'Form');

  // If the element is removed while the network request is actively in the air
  if (!el.isConnected) {
    activeRequests.delete(el);
    return fallbackResponse(options, 'Element disconnected from DOM');
  }

  // Bail out if disabled
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    return fallbackResponse(options, 'Element is disabled');
  }

  let url = options.url || null;
  if (url) {
    url = resolveStoreUrl(url, app.stores);
  }

  if (!url) {
    warn('Invalid or missing URL for the fetch request.', el);

    const error = new Error('Invalid or missing URL for the fetch request.');
    dispatch(el, 'rz:fetch:error', { error, config: options });

    return fallbackResponse(options, error.message, 'INTERNAL_ERROR');
  }

  const finalRequestInit = resolveRequestConfig(el, 'fetch', app);
  const formMethod = isFormEl ? el.getAttribute('method') : undefined;

  const method = (
    options.method || // rz-fetch
    finalRequestInit.method || // rz-request / rz-fetch-request
    formMethod || // form native attribute
    'GET'
  ).toUpperCase();

  const hasExplicitBody =
    finalRequestInit.body !== undefined || options.body !== undefined;

  // Process standalone inputs to build the body or modify URL
  if (!hasExplicitBody) {
    extractFieldValues(el, method, finalRequestInit);
  }

  // Automatically generate an abort key if one isn't provided to guarantee
  // an element can never have conflicting requests.
  let autoAbortKey = state?.abortKey;
  if (!autoAbortKey) {
    autoAbortKey = uniqueKey('rz_abort_');
    activeRequests.set(el, { ...state, abortKey: autoAbortKey });
  }

  // Final unified config object
  const finalOptions: RouseRequest = {
    ...finalRequestInit,
    ...options,
    method,
    abortKey: options.abortKey || finalRequestInit.abortKey || autoAbortKey,
    triggerEl: el,
    form: hasExplicitBody ? undefined : isFormEl ? (el as HTMLFormElement) : undefined,
  };

  const shouldDispatch = finalOptions.dispatchEvents !== false;

  if (shouldDispatch) {
    const configEvent = dispatch(
      el,
      'rz:fetch:config',
      { config: finalOptions, url, method },
      { cancelable: true },
    );

    if (configEvent.defaultPrevented) {
      return fallbackResponse(finalOptions, 'Prevented by rz:fetch:config listener');
    }
  }

  el.classList.add('rz-loading');
  el.setAttribute('aria-busy', 'true');

  if (shouldDispatch) {
    dispatch(el, 'rz:fetch:start', { config: finalOptions });
  }

  try {
    const result = await request(url, finalOptions, app);
    const rouseHeaders = extractRouseHeaders(result.headers);

    if (rouseHeaders.redirect) {
      activeRequests.delete(el);
      window.location.assign(rouseHeaders.redirect);
      return result;
    }

    // Native browser-followed redirect (e.g., expired session -> login page).
    // Server intent via Rouse-Redirect wins. Falls through to the redirected
    // short-circuit in the error block below.
    if (result.response?.redirected) {
      if (isSameOrigin(result.response.url)) {
        activeRequests.delete(el);
        window.location.assign(result.response.url);
        return result;
      }
      warn(`Cross-origin redirect blocked: '${result.response.url}'.`);
      result.error = {
        message: 'Cross-origin redirect blocked',
        status: 'REDIRECTED',
      };
    }

    applyUrlChange(rouseHeaders.pushUrl, rouseHeaders.replaceUrl);

    if (rouseHeaders.target) {
      result.targetOverride = rouseHeaders.target;
    }

    if (result.error) {
      if (result.error.status === 'CANCELED') {
        if (shouldDispatch) {
          dispatch(el, 'rz:fetch:abort', { config: finalOptions });
        }
        return result;
      }

      if (result.error.status === 'REDIRECTED') {
        // For cross-origin redirects, fire the error event for observability,
        // but do not route the payload.
        if (shouldDispatch) {
          dispatch(el, 'rz:fetch:error', { error: result.error, config: finalOptions });
        }
        return result;
      }

      // HTTP error (4xx/5xx) or parse error: dispatch error event and route payload.
      if (shouldDispatch) {
        dispatch(el, 'rz:fetch:error', { error: result.error, config: finalOptions });

        if (result.response) {
          routePayload('error', el, result);
        }
      }
      return result;
    }

    if (shouldDispatch) {
      dispatch(el, 'rz:fetch:success', result);

      if (result.response) {
        // Custom trigger event
        if (rouseHeaders.trigger) {
          dispatch(el, rouseHeaders.trigger, result);
        }

        routePayload('success', el, result);
      }
    }
    return result;
  } catch (error: any) {
    if (shouldDispatch) {
      dispatch(el, 'rz:fetch:error', { error, config: finalOptions });
    }

    return fallbackResponse(
      finalOptions,
      error.message || 'Internal Error',
      'INTERNAL_ERROR',
    );
  } finally {
    el.classList.remove('rz-loading');
    el.removeAttribute('aria-busy');

    if (shouldDispatch) {
      dispatch(el, 'rz:fetch:end', { config: finalOptions });
    }
  }
}

/**
 * Handles dispatching lifecycle events which enables JSON and HTML payload routing.
 */
function routePayload(type: 'error' | 'success', el: Element, result: RouseResponse) {
  const eventPrefix = `rz:fetch:${type}`;
  const data = result.data;

  // Check for files (Blob/ArrayBuffer)
  if (isFileType(data)) {
    dispatch(el, `${eventPrefix}:file`, result);
    return;
  }

  // Check for parsed JSON (POJO or Array)
  // Store manager requires parsed objects to merge state
  if (Array.isArray(data) || isPlainObject(data)) {
    dispatch(el, `${eventPrefix}:json`, result);
    return;
  }

  // Handle strings (HTML/Text)
  if (typeof data === 'string') {
    const contentType = result.response?.headers.get('Content-Type') || '';

    if (isJsonType(contentType)) {
      warn(`Content-Type is JSON but data is String. Defaulting to HTML.`);
    }

    dispatch(el, `${eventPrefix}:html`, result);
    return;
  }

  // Ignore null/undefined (e.g., 204 No Content), but warn on unhandled complex types
  if (data !== null && data !== undefined) {
    const typeName = data?.constructor?.name || typeof data;
    warn(`Unsupported payload: ${typeName}.`);
  }
}

/**
 * Applies a server-directed URL change via history.pushState / replaceState.
 * Rejects cross-origin URLs to defend against a compromised backend.
 */
function applyUrlChange(pushUrl: string | null, replaceUrl: string | null): void {
  const url = pushUrl ?? replaceUrl;
  if (url === null) return;

  if (pushUrl && replaceUrl) {
    warn('Both Rouse-Push-Url and Rouse-Replace-Url present. Using Push.');
  }

  if (!isSameOrigin(url)) {
    const headerName = pushUrl ? 'Rouse-Push-Url' : 'Rouse-Replace-Url';
    warn(`${headerName} rejected: cross-origin URL '${url}'.`);
    return;
  }

  const method = pushUrl ? 'pushState' : 'replaceState';

  try {
    history[method]({}, '', url);
  } catch (e) {
    warn(`${method} failed for URL '${url}':`, e);
  }
}

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}
