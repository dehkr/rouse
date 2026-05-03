import type { RouseApp } from '../core/app';
import { DEFAULT_INTERVAL_MS, isTimeModifier, parseTime } from '../core/timing';
import type { TriggerDef } from '../types';
import { is, on } from './utils';

const visibilityCallbacks = new WeakMap<Element, () => void>();

/**
 * Shared IntersectionObserver for `intersect` events and `rz-wake` strategies
 */
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const callback = visibilityCallbacks.get(el);
      if (callback) {
        callback();
        visibilityCallbacks.delete(el);
      }
      visibilityObserver.unobserve(el);
    }
  });
});

/**
 * Wakes immediately when document is ready
 */
export function whenLoaded(callback: () => void) {
  if (document.readyState === 'complete') {
    callback();
  } else {
    window.addEventListener('load', callback, { once: true });
  }
}

/**
 * Wakes after provided delay in ms
 */
export function whenDelayOver(delay: number, callback: () => void) {
  setTimeout(callback, delay);
}

/**
 * Wakes when the element is visible or scrolled into view
 */
export function whenVisible(el: Element, callback: () => void) {
  visibilityCallbacks.set(el, callback);
  visibilityObserver.observe(el);
}

/**
 * Wakes when the media query matches
 */
export function whenMediaMatches(mediaQuery: string, callback: () => void) {
  if (!mediaQuery) {
    callback();
    return;
  }
  const mql = window.matchMedia(mediaQuery);
  if (mql.matches) {
    callback();
  } else {
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        callback();
        mql.removeEventListener('change', handler);
      }
    };
    mql.addEventListener('change', handler);
  }
}

/**
 * Wakes on any custom event
 */
export function whenEvent(event: string, callback: () => void) {
  if (!event) {
    callback();
    return;
  }
  window.addEventListener(event, callback, { once: true });
}

/**
 * Wakes when the user interacts with the element
 */
export function whenInteracted(
  el: Element,
  callback: () => void,
  triggers: string[] | string = ['mouseover', 'focusin', 'touchstart'],
) {
  const triggerList = Array.isArray(triggers) ? triggers : [triggers];
  let called = false;

  const interactHandler = () => {
    if (called) return;
    called = true;

    callback();
    triggerList.forEach((evt) => {
      el.removeEventListener(evt, interactHandler);
    });
  };
  triggerList.forEach((evt) => {
    el.addEventListener(evt, interactHandler, { passive: true });
  });
}

/**
 * Wakes when the browser is idle
 */
export function whenIdle(callback: () => void) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback);
  } else {
    // Fallback for Safari since it doesn't support requestIdleCallback (as of Jan 2026)
    setTimeout(callback, 1);
  }
}

export function attachWakeStrategies(
  el: Element,
  strategies: [string, string][],
  onWake: () => void,
) {
  let pending = strategies.length;
  if (pending === 0) {
    return onWake();
  }

  // Wake triggers only when all conditions are satisfied
  const satisfy = () => {
    pending--;
    if (pending === 0) {
      onWake();
    }
  };

  // Strategy Logic
  strategies.forEach(([strategy, param]) => {
    switch (strategy) {
      case 'load':
        return whenLoaded(satisfy);
      case 'delay':
        return whenDelayOver(parseInt(param, 10) || 0, satisfy);
      case 'visible':
        return whenVisible(el, satisfy);
      case 'media':
        return whenMediaMatches(param, satisfy);
      case 'event':
        return whenEvent(param, satisfy);
      case 'interaction':
        return whenInteracted(el, satisfy);
      case 'idle':
        return whenIdle(satisfy);
      default:
        satisfy();
    }
  });
}

export interface TriggerContext {
  el: Element;
  app: RouseApp;
  modifiers: string[];
  action: (e?: Event) => void;
}

export type SyntheticEventHandler = (ctx: TriggerContext) => (() => void) | null;

/**
 * Universal synthetic events available to any TriggerDirective.
 * Store-specific events (mutate) stay inline in rz-save-on.
 */
export const syntheticEvents: Record<string, SyntheticEventHandler> = {
  // Fires immediately and once
  load: ({ action }) => {
    action();
    return null;
  },

  // Repeating timer
  // Supports `.once` modifier for single fire after delay
  interval: ({ modifiers, action }) => {
    const isOnce = modifiers.includes('once');

    // Find the first time modifier
    const timeModifier = modifiers.find(isTimeModifier) ?? DEFAULT_INTERVAL_MS;
    const ms = parseTime(timeModifier);

    if (ms <= 0) return null;

    const setup = isOnce ? window.setTimeout : window.setInterval;
    const cleanup = isOnce ? window.clearTimeout : window.clearInterval;

    const id = setup(action, ms);
    return () => cleanup(id);
  },

  // Explicit no-op (opts the directive out of all auto-binding)
  none: () => null,

  // Connectivity
  online: ({ action }) => attachWindowEvent('online', action),
  offline: ({ action }) => attachWindowEvent('offline', action),

  // Document visibility (tab switch / minimize)
  visible: ({ action }) => attachVisibilityChange(action, 'visible'),
  hidden: ({ action }) => attachVisibilityChange(action, 'hidden'),

  // Page show (initial load + bfcache restore)
  back: ({ action }) => attachWindowEvent('pageshow', action),

  // Element-scoped one-shots from scheduler primitives
  intersect: ({ el, action }) => {
    whenVisible(el, action);
    return null;
  },
  interaction: ({ el, action }) => {
    whenInteracted(el, action);
    return null;
  },
  idle: ({ action }) => {
    whenIdle(action);
    return null;
  },

  // App lifecycle
  ready: ({ app, action }) => {
    const handler = () => action();
    app.root.addEventListener('rz:app:ready', handler, { once: true });
    return () => app.root.removeEventListener('rz:app:ready', handler);
  },
};

export function dispatchTriggers(
  triggers: TriggerDef[],
  base: Omit<TriggerContext, 'modifiers'>,
): Array<() => void> {
  const cleanups: Array<() => void> = [];

  for (const trigger of triggers) {
    const cleanup = dispatchOne(trigger, base);
    if (cleanup) cleanups.push(cleanup);
  }

  return cleanups;
}

export function dispatchOne(
  trigger: TriggerDef,
  base: Omit<TriggerContext, 'modifiers'>,
): (() => void) | null {
  const handler = syntheticEvents[trigger.event];

  if (handler) {
    return handler({ ...base, modifiers: trigger.modifiers });
  }

  // Fall through to standard DOM event listener
  return on(
    base.el,
    trigger.event,
    (e: Event) => {
      if (
        (is(base.el, 'Form') && e.type === 'submit') ||
        (is(base.el, 'Anchor') && e.type === 'click')
      ) {
        e.preventDefault();
      }
      base.action(e);
    },
    trigger.modifiers,
  );
}

function attachWindowEvent(event: string, action: () => void): () => void {
  window.addEventListener(event, action);
  return () => window.removeEventListener(event, action);
}

function attachVisibilityChange(
  action: () => void,
  state: 'visible' | 'hidden',
): () => void {
  const handler = () => {
    if (document.visibilityState === state) action();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
