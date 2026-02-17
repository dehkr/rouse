import { bus } from '../core/bus';
import { parseDirective } from '../dom/parser';
import { dispatch, insert, isForm, isInput, isSelect, isTextArea } from '../dom/utils';
import { request } from '../net/request';
import { getDirective } from './prefix';
import { getInsertConfig } from './rz-insert';
import { getPublishTopic } from './rz-publish';
import { getRequestConfig } from './rz-req';

export const SLUG = 'fetch' as const;

const timers = new WeakMap<HTMLElement, { debounce?: any; poll?: any }>();

/**
 * Fetch orchestration
 */
export async function handleFetch(el: HTMLElement, loadingClass = 'rz-loading') {
  const config = getRequestConfig(el);
  const { debounce = 0, poll = 0, ...reqOpts } = config;

  const existing = timers.get(el);
  if (existing?.poll) {
    clearTimeout(existing.poll);
  }

  if (debounce > 0) {
    if (existing?.debounce) {
      clearTimeout(existing.debounce);
    }
    timers.set(el, {
      ...existing,
      debounce: setTimeout(() => executeFetch(el, loadingClass, reqOpts, poll), debounce),
    });
    return;
  }

  executeFetch(el, loadingClass, reqOpts, poll);
}

async function executeFetch(
  el: HTMLElement,
  loadingClass: string,
  options: any,
  pollInterval: number,
) {
  let url: string | null = null;
  let method = 'GET';

  // Parse URL and method from directive
  const fetchRaw = getDirective(el, SLUG);
  if (fetchRaw) {
    const parsed = parseDirective(fetchRaw);
    const firstPair = parsed[0];

    if (firstPair) {
      const [key, val] = firstPair;
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

  // Handle standalone inputs
  // Capture the value if the trigger is an input,
  // since it won't be auto-serialized like a form.
  const isField = isInput(el) || isSelect(el) || isTextArea(el);
  
  if (isField) {
    const field = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.name) {
      if (method === 'GET') {
        // Append to URL search params
        // document.baseURI ensures relative URLs resolve correctly
        const urlObj = new URL(url, document.baseURI);
        urlObj.searchParams.set(field.name, field.value);
        url = urlObj.toString();
      } else if (!options.body) {
        // For POST/PUT, send as JSON if not already defined
        options.body = { [field.name]: field.value };
      }
    }
  }

  // Lifecycle
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
      serializeForm: isForm(el) ? el : undefined,
      ...options,
    });

    if (result.error) {
      if (result.error.status === 'CANCELED') return;
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

    // Polling
    if (pollInterval > 0) {
      const timer = setTimeout(
        () => executeFetch(el, loadingClass, options, pollInterval),
        pollInterval,
      );
      timers.set(el, { poll: timer });
    }
  } catch (err: any) {
    console.error('[Rouse] Fetch failed:', err);
    dispatch(el, 'rz:fetch:error', { error: err });
  } finally {
    el.classList.remove(loadingClass);
    el.setAttribute('aria-busy', 'false');
    dispatch(el, 'rz:fetch:end');
  }
}
