import { rzTrigger } from '.';
import type { RouseApp } from '../core/app';
import { getDirectiveValue, hasDirective, parseMethodAndUrl } from '../core/shared';
import { is, on } from '../dom/utils';
import { cleanupFetch, handleFetch } from '../net/engine';
import type { ConfigDirective, DirectiveSlug, ManagerDirective } from '../types';

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
const fetchCleanups = new WeakMap<Element, Array<() => void>>();

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

  const cleanups: Array<() => void> = [];
  const action = () => handleFetch(el, app, getConfig(el));

  let triggerCleanup: ReturnType<typeof rzTrigger.attachTriggers>;
  if (rzTrigger.existsOn(el)) {
    triggerCleanup = rzTrigger.attachTriggers(el, action);
  }

  // If triggers were processed, `triggerCleanup` will be truthy, and the explicit
  // event triggers will be used. Otherwise, logical defaults are configured.
  if (triggerCleanup) {
    cleanups.push(triggerCleanup);
  } else {
    const isFormEl = is(el, 'Form');
    const isAnchorEl = is(el, 'Anchor');
    const isFieldEl = is(el, 'Input') || is(el, 'Select') || is(el, 'TextArea');

    const defaultEvent = isFormEl ? 'submit' : isFieldEl ? 'change' : 'click';

    const removeListener = on(el, defaultEvent, (e: Event) => {
      if ((isFormEl && e.type === 'submit') || (isAnchorEl && e.type === 'click')) {
        e.preventDefault();
      }
      action();
    });

    cleanups.push(removeListener);
  }

  if (cleanups.length > 0) {
    fetchCleanups.set(el, cleanups);
  }
}

/**
 * Tears down pacing engines and synthetic polling intervals
 */
function teardown(el: Element) {
  cleanupFetch(el);

  const cleanups = fetchCleanups.get(el);
  if (cleanups) {
    // Cleans up poll intervals/listeners
    cleanups.forEach((fn) => {
      fn();
    });
    fetchCleanups.delete(el);
  }
}
