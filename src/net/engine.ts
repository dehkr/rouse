import { defaultConfig, getApp, type RouseApp } from '../core/app';
import { err, warn } from '../core/shared';
import { rzFetch, rzRequest } from '../directives';
import { dispatch, isAnchor, isForm, isInput, isSelect, isTextArea } from '../dom/utils';
import type { RouseRequest, RouseResponse } from '../types';
import { request } from './request';
import { fallbackResponse } from './response';

type RequestState = { abortKey?: string; destroyed?: boolean };
const activeRequests = new WeakMap<Element, RequestState>();

/**
 * Handles the preparation, pacing, and execution of a network request.
 */
export async function handleFetch(
  el: Element,
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
    return await executeFetch(el, programmaticOpts);
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
async function executeFetch(el: Element, options: RouseRequest) {
  const app = getApp(el);
  const appConfig = app?.config || defaultConfig;
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

  // Parse URL and method from rz-fetch directive
  if (!url) {
    const parsed = rzFetch.handler(el);
    if (parsed.url) {
      url = parsed.url;
    }
    if (parsed.method && !explicitMethod) {
      explicitMethod = parsed.method;
    }
  }

  let formMethod: string | undefined;

  // Fallbacks for URL and capture native form method
  if (isForm(el)) {
    if (!url) {
      url = el.action;
    }
    formMethod = el.getAttribute('method') || undefined;
  } else if (isAnchor(el)) {
    if (!url) {
      url = el.href;
    }
  }

  if (!url) {
    const error = new Error('No URL specified for rz-fetch');
    warn('No URL found for rz-fetch directive on element:', el);
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

  const isFormEl = isForm(el);
  const hasExplicitBody =
    finalRequestInit.body !== undefined || options.body !== undefined;

  // Process standalone inputs to build the body or modify URL
  if (!hasExplicitBody && (isInput(el) || isSelect(el) || isTextArea(el))) {
    const field = el;

    if (field.name) {
      let values: string[] = [];

      if (field.type === 'radio') {
        // Find the checked radio in the same group (scoped to form if applicable)
        const root = field.closest('form') || document;
        const checked = root.querySelector(
          `input[type="radio"][name="${CSS.escape(field.name)}"]:checked`,
        ) as HTMLInputElement | null;

        if (checked) {
          values = [checked.value];
        }
      }
      // Checkbox
      else if (field.type === 'checkbox') {
        if ((field as HTMLInputElement).checked) {
          values = [field.value];
        }
      }
      // Multi-select
      else if (isSelect(field) && field.multiple) {
        values = Array.from(field.selectedOptions).map((opt) => opt.value);
      }
      // Default
      else {
        values = [field.value];
      }

      if (values.length > 0) {
        if (method === 'GET') {
          // Preserve hashes and search params for both relative and absolute URLs
          const urlObj = new URL(url, window.location.href);
          values.forEach((val) => {
            urlObj.searchParams.append(field.name, val);
          });

          // Use relative path only for same-origin http(s) URLs
          const isSameOrigin = urlObj.origin === window.location.origin;
          const isHttp = url.startsWith('http') || url.startsWith('//');

          url =
            isSameOrigin && isHttp
              ? urlObj.pathname + urlObj.search + urlObj.hash
              : urlObj.toString();
        } else {
          // Non-GET methods: add to body
          finalRequestInit.body =
            values.length > 1 ? { [field.name]: values } : { [field.name]: values[0] };
        }
      }
    }
  }

  // Automatically generate abort key if one isn't provided
  // Guarantees an element can never have conflicting requests
  let autoAbortKey = activeRequests.get(el)?.abortKey;
  if (!autoAbortKey) {
    autoAbortKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `rzAbort_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
      }
      return result;
    }

    const { data, response } = result;

    if (shouldDispatch) {
      dispatch(el, 'rz:fetch:success', result);

      if (response) {
        const contentType = response.headers.get('Content-Type') || '';

        // Payload routing
        if (contentType.includes('application/json')) {
          dispatch(el, 'rz:fetch:success:json', result);
        } else if (contentType.includes('text/html')) {
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
  const localConfig = rzRequest.handler(el, app);

  return {
    ...globalConfig,
    ...localConfig,
  };
}
