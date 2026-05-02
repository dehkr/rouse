import { defaultConfig, type RouseApp } from '../core/app';
import {
  err,
  isFileType,
  isJsonType,
  isPlainObject,
  uniqueKey,
  warn,
} from '../core/shared';
import { extractFieldValues } from '../dom/forms';
import { dispatch, is } from '../dom/utils';
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
  const appConfig = app.config || defaultConfig;
  const loadingClass = appConfig.ui.loadingClass;
  const state = activeRequests.get(el);

  // If the element is removed while the network request is actively in the air
  if (!el.isConnected) {
    activeRequests.delete(el);
    return fallbackResponse(options, 'Element disconnected from DOM');
  }

  // Bail out if disabled
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    return fallbackResponse(options, 'Element is disabled');
  }

  let url: string | null = options.url || null;
  let formMethod: string | undefined;

  const isFormEl = is(el, 'Form');

  // Fallbacks for URL and capture native form method
  if (isFormEl) {
    if (!url) {
      url = el.action;
    }
    formMethod = el.getAttribute('method') || undefined;
  } else if (is(el, 'Anchor')) {
    if (!url) {
      url = el.href;
    }
  }

  if (!url) {
    const error = new Error('No URL specified for rz-fetch.');
    warn('No URL specified for rz-fetch.', el);
    dispatch(el, 'rz:fetch:error', { error, config: options });
    return fallbackResponse(options, error.message, 'INTERNAL_ERROR');
  }

  // Resolve request inheritance overrides
  const finalRequestInit = resolveRequestConfig(el, app);

  // Resolve method
  const method = (
    options.method ||
    finalRequestInit.method ||
    formMethod ||
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
    autoAbortKey = uniqueKey('rz-abort-');
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

  el.classList.add(loadingClass);
  el.setAttribute('aria-busy', 'true');

  if (shouldDispatch) {
    dispatch(el, 'rz:fetch:start', { config: finalOptions });
  }

  try {
    const result = await request(url, finalOptions, appConfig);
    const rouseHeaders = extractRouseHeaders(result.headers);

    // If redirect
    if (rouseHeaders.redirect) {
      activeRequests.delete(el);
      window.location.href = rouseHeaders.redirect;
      return result;
    }

    // Target override
    if (rouseHeaders.target) {
      result.targetOverride = rouseHeaders.target;
    }

    // Handle error
    if (result.error) {
      if (result.error.status === 'CANCELED') {
        if (shouldDispatch) {
          dispatch(el, 'rz:fetch:abort', { config: finalOptions });
        }
        return result;
      }
      // It's an HTTP error (4xx/5xx) or parse error.
      // Dispatch the error event and return the result object.
      if (shouldDispatch) {
        dispatch(el, 'rz:fetch:error', { error: result.error, config: finalOptions });

        if (result.response) {
          routePayload('error', el, result);
        }
      }
      return result;
    }

    // Handle success
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
    el.classList.remove(loadingClass);
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
