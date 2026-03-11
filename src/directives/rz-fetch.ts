import { defaultConfig, getApp } from '../core/app';
import { parseDirective } from '../dom/parser';
import { dispatch, insert, isForm, isInput, isSelect, isTextArea } from '../dom/utils';
import { request } from '../net/request';
import type { RouseReqOpts } from '../types';
import { getDirective, selector } from './prefix';
import { getInsertConfig } from './rz-insert';
import { getPublishTopic } from './rz-publish';
import { getRequestConfig } from './rz-request';
import { getTuningStrategy } from './rz-tune';

type TimeoutId = ReturnType<typeof setTimeout>;

type TimerState = {
  debounce?: TimeoutId;
  throttle?: TimeoutId;
  throttlePending?: boolean;
  poll?: TimeoutId;
  abortKey?: string;
  destroyed?: boolean;
};

export const SLUG = 'fetch' as const;

const timers = new WeakMap<HTMLElement, TimerState>();

const EVENTS = {
  CONFIG: 'rz:fetch:config',
  START: 'rz:fetch:start',
  SUCCESS: 'rz:fetch:success',
  ERROR: 'rz:fetch:error',
  ABORT: 'rz:fetch:abort',
  INSERT_BEFORE: 'rz:fetch:insert:before',
  INSERT: 'rz:fetch:insert',
  END: 'rz:fetch:end',
} as const;

/**
 * This function acts as the gatekeeper before a network request is fired. It parses
 * the `rz-tune` directive to determine the execution strategy:
 *
 * - Throttle: executes immediately, then ignores subsequent triggers for `n` ms
 * - Debounce (trailing): waits for `n` ms of inactivity before executing (default)
 * - Debounce (leading): executes immediately, then locks until `n` ms of inactivity
 * - Immediate: bypasses all timers and executes immediately
 *
 * Once timing conditions are met, it strips the timing modifiers and forwards the
 * clean request options to `executeFetch`.
 *
 * @param el - The DOM element triggering the network request.
 */
export async function handleFetch(el: HTMLElement) {
  const config = getTuningStrategy(el);
  const pollInterval = Math.max(0, Number(config.poll) || 0);

  let debounce = 0;
  let isLeading = false;

  if (config.debounce !== undefined) {
    debounce = config.debounce;
    const mods = config.modifiers?.debounce || [];
    isLeading = mods.includes('leading');
  }

  const throttle = Number(config.throttle) || 0;

  // Strip timing keys to keep reqOpts clean
  const { poll: _p, debounce: _d, throttle: _t, modifiers: _m, ...reqOpts } = config;

  const existing = timers.get(el) || {};

  // THROTTLE

  if (throttle > 0) {
    if (!existing.throttle) {
      executeFetch(el, reqOpts, pollInterval);

      const timerId = setTimeout(() => {
        const state = timers.get(el);
        if (state?.destroyed) return;

        if (state?.throttlePending) {
          executeFetch(el, reqOpts, pollInterval);
          updateTimer(el, 'throttlePending', false);
        }
        updateTimer(el, 'throttle', undefined);
      }, throttle);

      updateTimer(el, 'throttle', timerId);
    } else {
      updateTimer(el, 'throttlePending', true);
    }
    return;
  }

  // DEBOUNCE

  if (debounce > 0) {
    if (isLeading) {
      const canFire = !existing.debounce;
      clearTimer(el, 'debounce');

      if (canFire) {
        executeFetch(el, reqOpts, pollInterval);
      }

      const timerId = setTimeout(() => {
        updateTimer(el, 'debounce', undefined);
      }, debounce);

      updateTimer(el, 'debounce', timerId);
    } else {
      // Trailing edge
      clearTimer(el, 'debounce');

      const timerId = setTimeout(() => {
        updateTimer(el, 'debounce', undefined);
        if (timers.get(el)?.destroyed) return;
        executeFetch(el, reqOpts, pollInterval);
      }, debounce);

      updateTimer(el, 'debounce', timerId);
    }
    return;
  }

  // IMMEDIATE

  clearTimer(el, 'debounce');
  executeFetch(el, reqOpts, pollInterval);
}

/**
 * The core execution engine for the `rz-fetch` directive. Handles the complete lifecycle
 * of a network request once timing conditions (throttle/debounce) have been satisfied.
 *
 * - Garbage-collects timers if the element is removed from the DOM
 * - Pauses polling if `disabled` or `aria-disabled="true"` attributes are present
 * - Extracts target URLs and serializes standalone inputs
 * - Dispatches state events that can be intercepted
 * - Injects returned HTML payloads into the DOM via `rz-insert`
 * - Broadcasts returned JSON payloads to the event bus via `rz-publish`
 * - Enables polling timers to continue through network errors and abort cancellations
 *
 * @param el - The DOM element triggering the network request.
 * @param options - The sanitized request configuration passed to the network orchestrator.
 * @param pollInterval - The polling interval in milliseconds (0 if polling is disabled).
 */
async function executeFetch(
  el: HTMLElement,
  options: RouseReqOpts,
  pollInterval: number,
) {
  const app = getApp(el);
  const appConfig = app?.config || defaultConfig;
  const loadingClass = appConfig.loadingClass;

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

  let url: string | null = null;
  let explicitMethod: string | undefined;
  let formMethod: string | undefined;

  // Parse URL and method from directive
  const fetchRaw = getDirective(el, SLUG);
  if (fetchRaw) {
    const parsed = parseDirective(fetchRaw);
    if (parsed[0]) {
      const [key, val] = parsed[0];
      if (val) {
        explicitMethod = key;
        url = val;
      } else {
        url = key;
      }
    }
  }

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
    dispatch(el, EVENTS.ERROR, { error, config: options });
    return;
  }

  // Grab rz-request fetch configuration overrides
  const reqEl = el.closest<HTMLElement>(selector('request'));
  const requestOverrides = reqEl ? getRequestConfig(reqEl, app) : {};

  // Merge native fetch configuration
  const finalRequestInit = {
    ...appConfig.request,
    ...requestOverrides,
  };

  // Resolve method
  const method = (
    explicitMethod ||
    options.method ||
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
    ...appConfig.tune,
    ...options,
    method,
    abortKey: options.abortKey || autoAbortKey,
    triggerEl: el,
    form: hasExplicitBody ? undefined : isFormEl ? (el as HTMLFormElement) : undefined,
  };

  // LIFECYCLE: config (cancelable)
  const configEvent = dispatch(
    el,
    EVENTS.CONFIG,
    { config: finalOptions, url, method },
    { cancelable: true },
  );

  if (configEvent.defaultPrevented) return;

  el.classList.add(loadingClass);
  el.setAttribute('aria-busy', 'true');

  // LIFECYCLE: start
  dispatch(el, EVENTS.START, { config: finalOptions });

  try {
    const result = await request(url, finalOptions, appConfig);

    if (result.error) {
      if (result.error.status === 'CANCELED') {
        dispatch(el, EVENTS.ABORT, { config: finalOptions });
        return;
      }
      throw result.error;
    }

    const { data, response } = result;

    // LIFECYCLE: success (fired on trigger element)
    dispatch(el, EVENTS.SUCCESS, { data, response, config: finalOptions });

    // HTML
    if (typeof data === 'string') {
      const operations = getInsertConfig(el);

      operations.forEach(({ targets, strategy }) => {
        if (targets.length > 0) {
          targets.forEach((target) => {
            // LIFECYCLE: before insert (fired on target, cancelable)
            const beforeInsertEvent = dispatch(
              target,
              EVENTS.INSERT_BEFORE,
              {
                data,
                triggerEl: el,
                targetEl: target,
                strategy,
                response,
              },
              { cancelable: true },
            );

            if (beforeInsertEvent.defaultPrevented) return;

            let dispatcherEl = target;

            if (strategy === 'outerHTML' || strategy === 'delete') {
              // Cache parent to fire the lifecycle event
              dispatcherEl = target.parentElement || document.body;
            }

            insert(target, beforeInsertEvent.detail.data, strategy);

            // LIFECYCLE: insert completion (fired on target or parent)
            dispatch(dispatcherEl, EVENTS.INSERT, {
              triggerEl: el,
              targetEl: target,
              strategy,
            });
          });
        }
      });
    }
    // JSON
    else {
      const topic = getPublishTopic(el);
      if (topic) {
        app?.bus.publish(topic, data);
      }
    }
  } catch (error: any) {
    console.error('[Rouse] Fetch failed:', error);
    // LIFECYCLE: error
    dispatch(el, EVENTS.ERROR, { error, config: finalOptions });
  } finally {
    el.classList.remove(loadingClass);
    el.removeAttribute('aria-busy');

    // LIFECYCLE: end
    dispatch(el, EVENTS.END, { config: finalOptions });

    // Poll timers should continue even if request aborted or after network errors
    schedulePoll(el, options, pollInterval);
  }
}

/**
 * Explicit timer cleanup handled by global MutationObserver
 */
export function cleanupFetch(el: HTMLElement) {
  clearTimer(el, 'poll');
  clearTimer(el, 'debounce');
  clearTimer(el, 'throttle');

  // Mark as destroyed to prevent callbacks from rescheduling
  const current = timers.get(el);
  if (current) {
    timers.set(el, { ...current, destroyed: true });
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

function clearTimer(el: HTMLElement, key: 'debounce' | 'throttle' | 'poll') {
  const current = timers.get(el);
  if (current?.[key]) {
    clearTimeout(current[key]);
    updateTimer(el, key, undefined);
  }
}

function schedulePoll(el: HTMLElement, options: RouseReqOpts, pollInterval: number) {
  const state = timers.get(el);
  if (pollInterval > 0 && !state?.destroyed) {
    clearTimer(el, 'poll');
    const timer = setTimeout(() => executeFetch(el, options, pollInterval), pollInterval);
    updateTimer(el, 'poll', timer);
  }
}
