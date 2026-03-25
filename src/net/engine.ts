import { defaultConfig, getApp } from '../core/app';
import { applyTiming, getTimingConfig, type PacedFunction } from '../core/timing';
import { getFetchDirective, getRequestConfig, getTuningStrategy } from '../directives';
import { selector } from '../directives/prefix';
import { dispatch, isForm, isInput, isSelect, isTextArea } from '../dom/utils';
import type { RouseReqOpts } from '../types';
import { request } from './request';

type TimerState = {
  pacedFetch?: PacedFunction<any>;
  poll?: ReturnType<typeof setTimeout>;
  abortKey?: string;
  destroyed?: boolean;
};

export const SLUG = 'fetch' as const;

const timers = new WeakMap<HTMLElement, TimerState>();

/**
 * Handles the preparation, pacing, and execution of a network request.
 */
export async function handleFetch(el: HTMLElement, programmaticOpts: RouseReqOpts = {}) {
  const app = getApp(el);
  const tuneConfig = getTuningStrategy(el);
  const timingMods = tuneConfig.timingModifiers || [];

  // Parse the modifiers to check if we are doing network-level polling or timeouts
  const timingConfig = getTimingConfig(timingMods, app?.config.timing);

  let state = timers.get(el);
  if (!state) {
    state = {};
    timers.set(el, state);
  }

  if (state.destroyed) return;

  const reqOpts: RouseReqOpts = {
    retry: tuneConfig.retry,
    abortKey: tuneConfig.abortKey,
    ...programmaticOpts,
  };

  // Explicitly attach timeout to the fetch config if requested
  if (timingConfig.strategy === 'timeout') {
    reqOpts.timeout = timingConfig.wait;
  }

  const pollInterval = timingConfig.strategy === 'poll' ? timingConfig.wait : 0;

  // Lazily create and cache the PacedFunction to preserve its
  // internal debounce/throttle state.
  if (!state.pacedFetch) {
    state.pacedFetch = applyTiming(
      (opts: RouseReqOpts, pollInt: number) => {
        try {
          executeFetch(el, opts, pollInt);
        } catch (error) {
          console.error(`[Rouse] Error executing fetch on element:`, el, error);
        }
      },
      timingMods,
      app?.config.timing,
    );
  }

  state.pacedFetch(reqOpts, pollInterval);
}

/**
 * Handles the complete lifecycle of a network request once timing
 * conditions (throttle/debounce) have been satisfied.
 *
 * @param el - The DOM element triggering the network request.
 * @param options - The sanitized request config passed to the network orchestrator.
 * @param pollInterval - The polling interval in milliseconds (0 if disabled).
 */
async function executeFetch(
  el: HTMLElement,
  options: RouseReqOpts,
  pollInterval: number,
) {
  const app = getApp(el);
  const appConfig = app?.config || defaultConfig;
  const loadingClass = appConfig.ui.loadingClass;

  // Check destroyed flag and bail out if marked for cleanup
  const state = timers.get(el);
  if (state?.destroyed) return;

  // If the element is removed while the network request is actively in the air
  if (!el.isConnected) {
    cleanupFetch(el);
    return;
  }

  // Allow pausing execution while keeping polling scheduled
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    schedulePoll(el, options, pollInterval);
    return;
  }

  let url: string | null = options.url || null;
  let explicitMethod: string | undefined = options.method;

  // Parse URL and method from rz-fetch directive
  if (!url) {
    const parsed = getFetchDirective(el);
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
  } else if (el instanceof HTMLAnchorElement) {
    if (!url) {
      url = el.href;
    }
  }

  if (!url) {
    const error = new Error('No URL specified for rz-fetch');
    console.warn('[Rouse] No URL found for rz-fetch directive on element:', el);
    dispatch(el, 'rz:fetch:error', { error, config: options });
    return;
  }

  // Grab rz-request fetch configuration overrides
  const reqEl = el.closest<HTMLElement>(selector('request'));
  const requestOverrides = reqEl ? getRequestConfig(reqEl, app) : {};

  // Merge native fetch configuration
  const finalRequestInit: RouseReqOpts = {
    ...appConfig.network.fetch,
    ...requestOverrides,
  };

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

  // A body added to the request config takes precedence over form data
  if (hasExplicitBody && isFormEl) {
    console.warn(
      `[Rouse] Explicit body config overrides form serialization on element:`,
      el,
    );
  }

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
  let autoAbortKey = timers.get(el)?.abortKey;
  if (!autoAbortKey) {
    autoAbortKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `rzAbort_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    updateTimer(el, 'abortKey', autoAbortKey);
  }

  // Final unified config object
  const finalOptions: RouseReqOpts = {
    ...finalRequestInit,
    ...options,
    method,
    abortKey: options.abortKey || autoAbortKey,
    triggerEl: el,
    form: hasExplicitBody ? undefined : isFormEl ? (el as HTMLFormElement) : undefined,
  };

  const configEvent = dispatch(
    el,
    'rz:fetch:config',
    { config: finalOptions, url, method },
    { cancelable: true },
  );

  if (configEvent.defaultPrevented) return;

  el.classList.add(loadingClass);
  el.setAttribute('aria-busy', 'true');

  dispatch(el, 'rz:fetch:start', { config: finalOptions });

  try {
    const result = await request(url, finalOptions, appConfig);

    if (result.error) {
      if (result.error.status === 'CANCELED') {
        dispatch(el, 'rz:fetch:abort', { config: finalOptions });
        return;
      }
      throw result.error;
    }

    const { data, response } = result;
    const payload = { data, response, config: finalOptions };

    dispatch(el, 'rz:fetch:success', payload);

    if (response) {
      const contentType = response.headers.get('Content-Type') || '';

      // Payload routing
      if (contentType.includes('application/json')) {
        dispatch(el, 'rz:fetch:success:json', payload);
      } else if (contentType.includes('text/html')) {
        dispatch(el, 'rz:fetch:success:html', payload);
      } else if (data instanceof Blob || data instanceof ArrayBuffer) {
        dispatch(el, 'rz:fetch:success:file', payload);
      }
    }
  } catch (error: any) {
    console.error('[Rouse] Fetch failed:', error);
    dispatch(el, 'rz:fetch:error', { error, config: finalOptions });
  } finally {
    el.classList.remove(loadingClass);
    el.removeAttribute('aria-busy');

    dispatch(el, 'rz:fetch:end', { config: finalOptions });

    // Poll timers should continue even if request aborted or after network errors
    schedulePoll(el, options, pollInterval);
  }
}

/**
 * Explicit timer cleanup handled by global MutationObserver
 */
export function cleanupFetch(el: HTMLElement) {
  const state = timers.get(el);
  if (state) {
    if (state.poll) {
      clearTimeout(state.poll);
    }
    if (state.pacedFetch) {
      state.pacedFetch.cancel();
    }
    timers.set(el, { ...state, destroyed: true });
  }
}

function updateTimer<K extends keyof TimerState>(
  el: HTMLElement,
  key: K,
  value: TimerState[K],
) {
  const current = timers.get(el) || {};
  timers.set(el, { ...current, [key]: value });
}

function schedulePoll(el: HTMLElement, options: RouseReqOpts, pollInterval: number) {
  const state = timers.get(el);
  if (!state) return;

  if (pollInterval > 0 && !state?.destroyed) {
    if (state.poll) {
      clearTimeout(state.poll);
    }
    const timer = setTimeout(() => executeFetch(el, options, pollInterval), pollInterval);
    updateTimer(el, 'poll', timer);
  }
}
