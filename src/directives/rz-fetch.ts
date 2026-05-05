import type { RouseApp } from '../core/app';
import { getDirectiveValue, hasDirective, parseMethodAndUrl } from '../core/shared';
import { attachListener } from '../dom/scheduler';
import { is, isNativeNavigation } from '../dom/utils';
import { handleFetch } from '../net/engine';
import type { ConfigDirective, DirectiveSlug, ManagerDirective, VoidFn } from '../types';
import { rzFetchOn } from './rz-fetch-on';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'fetch' as const satisfies DirectiveSlug;

export const rzFetch = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
  initialize,
  teardown,
} as const satisfies ConfigDirective<{ method?: string; url?: string }> &
  ManagerDirective;

// =======================================================================================

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const fetchCleanups = new WeakMap<Element, Array<VoidFn>>();

/**
 * Parses the rz-fetch attribute into a URL and method.
 * Supports the [method]: [url] format.
 *
 * - `rz-fetch="PUT: /api/users"`
 * - `rz-fetch="PUT"`
 * - `rz-fetch="/api/users"`
 */
function getConfig(el: Element) {
  return parseMethodAndUrl(getDirectiveValue(el, SLUG), {
    allowedMethods: HTTP_METHODS,
    label: 'fetch method',
  });
}

/**
 * Attaches synthetic events (like polling) and custom non-standard events
 * to an element and stores their cleanup functions.
 */
function initialize(el: Element, app: RouseApp) {
  if (fetchCleanups.has(el)) return;

  const cleanups: Array<VoidFn> = [];
  const action = () => handleFetch(el, app, getConfig(el));

  let triggerCleanup: ReturnType<typeof rzFetchOn.attachTriggers>;
  if (rzFetchOn.existsOn(el)) {
    triggerCleanup = rzFetchOn.attachTriggers(el, app, action);
  }

  // If triggers were processed, `triggerCleanup` will be truthy, and the explicit
  // event triggers will be used. Otherwise, logical defaults are configured.
  if (triggerCleanup) {
    cleanups.push(triggerCleanup);
  } else {
    const defaultEvent = is(el, 'Form')
      ? 'submit'
      : is(el, 'Input') || is(el, 'Select') || is(el, 'TextArea')
        ? 'change'
        : 'click';

    const cleanup = attachListener(el, defaultEvent, (e: Event) => {
      if (isNativeNavigation(el, e)) {
        e.preventDefault();
      }
      action();
    });

    cleanups.push(cleanup);
  }

  if (cleanups.length > 0) {
    fetchCleanups.set(el, cleanups);
  }
}

function teardown(el: Element) {
  fetchCleanups.get(el)?.forEach((fn) => fn());
  fetchCleanups.delete(el);
}
