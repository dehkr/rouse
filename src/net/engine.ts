import { defaultConfig, type RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { err, isInsertableType, isJsonType, uniqueKey, warn } from '../core/shared';
import { rzError, rzRequest, rzTarget } from '../directives';
import { extractFieldValues } from '../dom/forms';
import { dispatch, is } from '../dom/utils';
import type { RouseRequest, RouseResponse } from '../types';
import { extractRouseHeaders } from './headers';
import { request } from './request';
import { fallbackResponse } from './response';

type RequestState = { abortKey?: string; destroyed?: boolean };
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

  if (state.destroyed) {
    return fallbackResponse(programmaticOpts, 'Element destroyed');
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

  // Check destroyed flag and bail out if marked for cleanup
  const state = activeRequests.get(el);
  if (state?.destroyed) {
    return fallbackResponse(options, 'Element destroyed');
  }

  // If the element is removed while the network request is actively in the air
  if (!el.isConnected) {
    cleanupFetch(el);
    return fallbackResponse(options, 'Element disconnected from DOM');
  }

  // Bail out if disabled
  // TODO: confirm this behavior
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    return fallbackResponse(options, 'Element is disabled');
  }

  let url: string | null = options.url || null;
  let explicitMethod: string | undefined = options.method;
  let formMethod: string | undefined;

  // Fallbacks for URL and capture native form method
  if (is(el, 'Form')) {
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
    const error = new Error('No URL specified for rz-fetch');
    warn('No URL found for rz-fetch on:', el);
    dispatch(el, 'rz:fetch:error', { error, config: options });
    return fallbackResponse(options, error.message, 'INTERNAL_ERROR');
  }

  // Resolve request inheritance overrides
  const finalRequestInit = resolveRequestConfig(el, app);

  // Resolve method
  const method = (
    explicitMethod ||
    finalRequestInit.method ||
    formMethod ||
    'GET'
  ).toUpperCase();

  const isFormEl = is(el, 'Form');
  const hasExplicitBody =
    finalRequestInit.body !== undefined || options.body !== undefined;

  // Process standalone inputs to build the body or modify URL
  if (!hasExplicitBody) {
    extractFieldValues(el, method, finalRequestInit);
  }

  // Automatically generate abort key if one isn't provided
  // Guarantees an element can never have conflicting requests
  let autoAbortKey = activeRequests.get(el)?.abortKey;
  if (!autoAbortKey) {
    autoAbortKey = `rzAbort_${uniqueKey()}`;
    const current = activeRequests.get(el) || {};
    activeRequests.set(el, { ...current, abortKey: autoAbortKey });
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
      cleanupFetch(el);
      window.location.href = rouseHeaders.redirect;
      return result;
    }

    // Target override
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
      // It's an HTTP error (4xx/5xx) or parse error.
      // Dispatch the error event and return the result object.
      if (shouldDispatch) {
        dispatch(el, 'rz:fetch:error', { error: result.error, config: finalOptions });

        if (result.response) {
          const contentType = result.response.headers.get('Content-Type') || '';
          const isJson = isJsonType(contentType);

          if (rzError.existsOn(el)) {
            rzError.route(el, app, result);
          }

          if (isJson) {
            dispatch(el, 'rz:fetch:error:json', result);
          } else if (isInsertableType(contentType)) {
            dispatch(el, 'rz:fetch:error:html', result);
          }
        }
      }
      return result;
    }

    const { data, response } = result;

    if (shouldDispatch) {
      dispatch(el, 'rz:fetch:success', result);

      if (response) {
        // Custom trigger event
        if (rouseHeaders.trigger) {
          dispatch(el, rouseHeaders.trigger, result);
        }

        const contentType = response.headers.get('Content-Type') || '';

        // Payload routing
        if (isJsonType(contentType)) {
          const activeTarget =
            result.targetOverride ||
            (typeof finalOptions.target === 'string'
              ? finalOptions.target
              : rzTarget.getDefinedValue(el));

          if (activeTarget) {
            const operations = parseDirectiveValue(activeTarget);
            for (const [method, selector] of operations) {
              const targetStr = selector || method;
              const fullOperation = selector ? `${method}: ${selector}` : method;

              // If the target is a store, natively route the JSON payload
              if (targetStr.startsWith('@')) {
                app.stores.update(targetStr.substring(1), data as object);
              } else {
                // Mock the HTML dispatch so mutator injects the JSON string
                // (Make sure you import displayString from updater.ts if you want it pretty-printed)
                dispatch(el, 'rz:fetch:success:html', {
                  ...result,
                  data: JSON.stringify(data, null, 2),
                  targetOverride: fullOperation,
                });
              }
            }
          }

          dispatch(el, 'rz:fetch:success:json', result);
        } else if (isInsertableType(contentType)) {
          dispatch(el, 'rz:fetch:success:html', result);
        } else if (data instanceof Blob || data instanceof ArrayBuffer) {
          dispatch(el, 'rz:fetch:success:file', result);
        }
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
 * Explicit cleanup for active requests
 */
export function cleanupFetch(el: Element) {
  const state = activeRequests.get(el);
  if (state) {
    activeRequests.set(el, { ...state, destroyed: true });
  }
}

/**
 * Resolves the final network configuration by merging global and local config.
 */
function resolveRequestConfig(
  el: Element,
  app: RouseApp | undefined,
): Partial<RouseRequest> {
  const globalConfig = app?.config.network.fetch || {};
  const localConfig = rzRequest.existsOn(el) ? rzRequest.getConfig(el, app) : {};

  return {
    ...globalConfig,
    ...localConfig,
  };
}
