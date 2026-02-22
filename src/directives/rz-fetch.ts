import { bus } from '../core/bus';
import { parseDirective } from '../dom/parser';
import { dispatch, insert, isForm, isInput, isSelect, isTextArea } from '../dom/utils';
import { request } from '../net/request';
import type { RouseReqOpts } from '../types';
import { getDirective } from './prefix';
import { getInsertConfig } from './rz-insert';
import { getPublishTopic } from './rz-publish';
import { getTuningStrategy } from './rz-tune';

export const SLUG = 'fetch' as const;

const timers = new WeakMap<HTMLElement, { debounce?: any; throttle?: any; poll?: any }>();

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
 * @param loadingClass - The CSS class applied to the element while the request is in-flight.
 */
export async function handleFetch(el: HTMLElement, loadingClass = 'rz-loading') {
  const config = getTuningStrategy(el) as Record<string, any>;
  const pollInterval = Number(config.poll) || 0;

  let debounce = 0;
  let isLeading = false;

  if (config.debounce !== undefined) {
    debounce = config.debounce;
    // Check for 'leading' modifier on the debounce key
    const mods = config.modifiers?.debounce || [];
    isLeading = mods.includes('leading');
  }

  const throttle = Number(config.throttle) || 0;

  // Strip timing keys to keep reqOpts clean
  const {
    poll: _p,
    debounce: _d,
    throttle: _t,
    modifiers: _m,
    ...reqOpts
  } = config;

  const existing = timers.get(el) || {};

  // THROTTLE

  if (throttle > 0) {
    if (existing.throttle) return;

    executeFetch(el, loadingClass, reqOpts, pollInterval);

    const timerId = setTimeout(() => {
      const current = timers.get(el) || {};
      timers.set(el, { ...current, throttle: undefined });
    }, throttle);

    timers.set(el, { ...existing, throttle: timerId });
    return;
  }

  // DEBOUNCE

  if (debounce > 0) {
    if (isLeading) {
      const canFire = !existing.debounce;
      if (existing.debounce) {
        clearTimeout(existing.debounce);
      }

      if (canFire) {
        executeFetch(el, loadingClass, reqOpts, pollInterval);
      }

      const timerId = setTimeout(() => {
        const current = timers.get(el) || {};
        timers.set(el, { ...current, debounce: undefined });
      }, debounce);

      timers.set(el, { ...existing, debounce: timerId });
    } else {
      // Trailing edge
      if (existing.debounce) clearTimeout(existing.debounce);

      const timerId = setTimeout(() => {
        const current = timers.get(el) || {};
        timers.set(el, { ...current, debounce: undefined });
        executeFetch(el, loadingClass, reqOpts, pollInterval);
      }, debounce);

      timers.set(el, { ...existing, debounce: timerId });
    }
    return;
  }

  // IMMEDIATE

  if (existing.debounce) {
    clearTimeout(existing.debounce);
    timers.set(el, { ...existing, debounce: undefined });
  }

  executeFetch(el, loadingClass, reqOpts, pollInterval);
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
 * @param loadingClass - The CSS class applied to the element while the request is in-flight.
 * @param options - The sanitized request configuration passed to the network orchestrator.
 * @param pollInterval - The polling interval in milliseconds (0 if polling is disabled).
 */
async function executeFetch(
  el: HTMLElement,
  loadingClass: string,
  options: RouseReqOpts,
  pollInterval: number,
) {
  // Clean up timers map to prevent memory leaks
  if (!document.body.contains(el)) {
    const existing = timers.get(el);
    if (existing) {
      if (existing.poll) clearTimeout(existing.poll);
      if (existing.debounce) clearTimeout(existing.debounce);
      if (existing.throttle) clearTimeout(existing.throttle);
    }
    timers.delete(el);
    return;
  }

  // Allow pausing execution while keeping polling scheduled
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    if (pollInterval > 0) {
      const timer = setTimeout(
        () => executeFetch(el, loadingClass, options, pollInterval),
        pollInterval,
      );
      timers.set(el, { ...(timers.get(el) || {}), poll: timer });
    }
    return;
  }

  let url: string | null = null;
  let method = 'GET';

  // Parse URL and method from directive
  const fetchRaw = getDirective(el, SLUG);
  if (fetchRaw) {
    const parsed = parseDirective(fetchRaw);
    if (parsed[0]) {
      const [key, val] = parsed[0];
      if (val) {
        method = key.toUpperCase();
        url = val;
      } else {
        url = key;
      }
    }
  }

  // Fallback to URL in href or action attributes
  if (!url) {
    if (el instanceof HTMLAnchorElement) {
      url = el.href;
    } else if (isForm(el)) {
      url = el.action;
    }
  }

  if (!url) return;

  // Handle standalone inputs since they aren't serialized like forms
  if (isInput(el) || isSelect(el) || isTextArea(el)) {
    const field = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    if (field.name) {
      let values: string[] = [];

      // Checkboxes/radios and multi-selects
      if (
        (field.type === 'checkbox' || field.type === 'radio') &&
        !(field as HTMLInputElement).checked
      ) {
        // Skip unchecked
      } else if (isSelect(field) && field.multiple) {
        values = Array.from(field.selectedOptions).map((opt) => opt.value);
      } else {
        values = [field.value];
      }

      if (values.length > 0) {
        if (method === 'GET') {
          // Use a temp base to parse relative URLs without losing hashes
          const tempBase = 'http://__rouse__';
          const urlObj = new URL(url, tempBase);
          values.forEach((val) => urlObj.searchParams.append(field.name, val));
          // Strip the temp base back out
          url = urlObj.toString().replace(tempBase, '');
        } else if (!options.body) {
          options.body =
            values.length > 1 ? { [field.name]: values } : { [field.name]: values[0] };
        }
      }
    }
  }

  // Lifecycle config
  const configEvent = dispatch(
    el,
    'rz:fetch:config',
    { config: options, url, method },
    { cancelable: true },
  );

  if (configEvent.defaultPrevented) return;

  el.classList.add(loadingClass);
  el.setAttribute('aria-busy', 'true');
  dispatch(el, 'rz:fetch:start', { config: options });

  try {
    const result = await request(url, {
      method,
      triggerEl: el,
      serializeForm: isForm(el) ? el : undefined,
      ...options,
    });

    if (result.error) {
      if (result.error.status === 'CANCELED') {
        dispatch(el, 'rz:fetch:abort');
        return; 
      }
      throw result.error;
    }

    const { data } = result;

    if (typeof data === 'string') {
      // HTML
      const operations = getInsertConfig(el);
      // Iterate over every operation in the list
      operations.forEach(({ targets, strategy }) => {
        if (targets.length > 0) {
          targets.forEach((target) => {
            insert(target, data, strategy);
            // Dispatch success on each target
            dispatch(target, 'rz:fetch:success', { content: data });
          });
        }
      });
    } else {
      // JSON
      dispatch(el, 'rz:fetch:success', { data });
      const topic = getPublishTopic(el);
      if (topic) {
        bus.publish(topic, data);
      }
    }
  } catch (err: any) {
    console.error('[Rouse] Fetch failed:', err);
    dispatch(el, 'rz:fetch:error', { error: err });
  } finally {
    el.classList.remove(loadingClass);
    el.setAttribute('aria-busy', 'false');
    dispatch(el, 'rz:fetch:end');

    // Poll timers should continue even if request aborted or after network errors
    if (pollInterval > 0) {
      const timer = setTimeout(
        () => executeFetch(el, loadingClass, options, pollInterval),
        pollInterval,
      );
      // Preserve any existing debounce timers for this element
      timers.set(el, { ...(timers.get(el) || {}), poll: timer });
    }
  }
}
