import { getApp, type RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import {
  applyTiming,
  DEFAULT_INTERVAL_MS,
  isTimeModifier,
  parseTime,
} from '../core/timing';
import type { ActionFn, LifecycleEvent, TriggerDef, VoidFn } from '../types';
import { applyModifiers, getListenerOptions, resolveListenerTarget } from './modifiers';
import { isNativeNavigation } from './utils';

const visibilityCallbacks = new WeakMap<Element, VoidFn>();

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
export function whenLoaded(callback: VoidFn) {
  if (document.readyState === 'complete') {
    callback();
  } else {
    window.addEventListener('load', callback, { once: true });
  }
}

/**
 * Wakes after provided delay in ms
 */
export function whenDelayOver(delay: number, callback: VoidFn) {
  setTimeout(callback, delay);
}

/**
 * Wakes when the element is visible or scrolled into view
 */
export function whenVisible(el: Element, callback: VoidFn) {
  visibilityCallbacks.set(el, callback);
  visibilityObserver.observe(el);
}

/**
 * Wakes when the media query matches
 */
export function whenMediaMatches(mediaQuery: string, callback: VoidFn) {
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
export function whenEvent(event: string, callback: VoidFn) {
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
  callback: VoidFn,
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
export function whenIdle(callback: VoidFn) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback);
  } else {
    // Fallback for Safari since it doesn't support requestIdleCallback (as of Jan 2026)
    setTimeout(callback, 1);
  }
}

/**
 * Coordinates `rz-wake` activation strategies. All strategies must be
 * satisfied before `onWake` fires. If no strategies are provided it
 * fires immediately.
 *
 * Each strategy maps to a `whenX` primitive in this module: `load`,
 * `delay`, `visible`, `media`, `event`, `interaction`, `idle`.
 *
 * @param el - The controller element awaiting activation.
 * @param strategies - Parsed `[strategy, param]` tuples from `rz-wake`.
 * @param onWake - Invoked once when all strategies have been satisfied.
 */
export function attachWakeStrategies(
  el: Element,
  strategies: [string, string][],
  onWake: VoidFn,
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
  app?: RouseApp;
  modifiers: string[];
  action: ActionFn;
}

export type SyntheticEventHandler = (ctx: TriggerContext) => VoidFn | null;

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

  delay: ({ modifiers, action }) => {
    // Find the first time modifier
    const timeModifier = modifiers.find(isTimeModifier) ?? DEFAULT_INTERVAL_MS;
    const ms = parseTime(timeModifier);

    if (ms <= 0) return null;

    const id = window.setTimeout(action, ms);
    return () => window.clearTimeout(id);
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

  // Element intersection with the viewport
  intersect: ({ el, action }) => {
    whenVisible(el, action);
    return null;
  },

  // Aggregate proxy for 'mouseover', 'focusin', or 'touchstart'
  interaction: ({ el, action }) => {
    whenInteracted(el, action);
    return null;
  },

  // window.requestIdleCallback
  idle: ({ action }) => {
    whenIdle(action);
    return null;
  },

  // App lifecycle
  ready: ({ el, app, action }) => {
    const appInstance = app || getApp(el);
    if (!appInstance) return null;

    // Handle case where controllers connect after `ready` event
    if (appInstance.isReady) {
      action();
      return null;
    }

    const handler = () => action();
    appInstance.root.addEventListener('rz:app:ready', handler, { once: true });

    return () => {
      appInstance.root.removeEventListener('rz:app:ready', handler);
    };
  },
};

/**
 * Dispatches a custom event from an element.
 *
 * @param options - Allows overriding cancelable/bubbles
 */
export function dispatch<T extends string, D = any>(
  el: EventTarget,
  name: T | LifecycleEvent,
  detail: D = {} as D,
  options: CustomEventInit = {},
): CustomEvent<D> {
  const event = new CustomEvent(name, {
    bubbles: true,
    cancelable: false,
    ...options,
    detail,
  });
  el.dispatchEvent(event);
  return event;
}

/**
 * Low-level DOM event listener primitive with modifier handling:
 *
 * - Listener options (`capture`, `once`, `passive`) via `getListenerOptions`
 * - Event-arg modifiers (`prevent`, `stop`, `self`, key filters) via `applyModifiers`
 * - Listener target resolution (`outside`) via `resolveListenerTarget`
 *
 * Does not apply pacing (debounce/throttle). Most callers should use the public
 * `on()` facade or `dispatchOne` instead. This is the primitive both build on.
 *
 * @returns Cleanup function that removes the listener.
 */
export function attachListener<D = any>(
  el: EventTarget,
  name: string,
  callback: (ev: CustomEvent<D>) => void,
  modifiers: string[] = [],
  abortSignal?: AbortSignal,
): VoidFn {
  const options = { ...getListenerOptions(modifiers), abortSignal };
  const listener = (e: Event) => {
    if (applyModifiers(e, el, modifiers)) {
      callback(e as CustomEvent<D>);
    }
  };

  const target = resolveListenerTarget(el as Element, modifiers);
  target.addEventListener(name, listener, options);

  return () => {
    target.removeEventListener(name, listener, options);
  };
}

/**
 * Parses a multi-event + modifier string, dispatches each trigger through
 * the synthetic-event registry (via `dispatchOne` or `attachListener`),
 * and returns a single aggregate cleanup that tears them all down.
 *
 * Backs `ctx.on` for controllers and is also exported for non-controller
 * code that needs the same trigger semantics as the declarative directives.
 *
 * @param target - Element (or other event target) to bind to.
 * @param events - Whitespace-separated event names with optional modifiers.
 * @param callback - Invoked when any of the events fires.
 * @param abortSignal - Optional signal that triggers cleanup on abort.
 *
 * @returns Cleanup function that removes all attached listeners.
 *
 * @example
 * on(el, 'click.debounce.100ms', handleClick);
 * on(el, 'mouseenter mouseleave', toggleHover);
 * on(el, 'visible online', refetch);
 * on(el, 'interval.5s', tick);
 * on(el, 'interval.10s.once', delayed);
 */
export function on<D = any>(
  target: EventTarget,
  events: string,
  callback: (ev: CustomEvent<D>) => void,
  abortSignal?: AbortSignal,
): VoidFn {
  const triggers = parseTriggers(events);
  if (triggers.length === 0) return () => {};

  const cleanups: Array<VoidFn> = [];

  for (const trigger of triggers) {
    const cleanup = dispatchOne(trigger, {
      el: target as Element,
      app: undefined,
      action: callback as ActionFn,
    });
    if (cleanup) cleanups.push(cleanup);
  }

  if (abortSignal) {
    abortSignal.addEventListener('abort', () => cleanups.forEach((fn) => fn()), {
      once: true,
    });
  }

  return () => cleanups.forEach((fn) => fn());
}

/**
 * Dispatches an array of trigger definitions and collects their cleanups.
 * Used by trigger directives (`rz-fetch-on`, `rz-save-on`, `rz-refresh-on`)
 * to wire multiple triggers from a single attribute value.
 *
 * @returns Array of cleanup functions from triggers that produce teardown logic.
 */
export function dispatchTriggers(
  triggers: TriggerDef[],
  base: Omit<TriggerContext, 'modifiers'>,
): Array<VoidFn> {
  const cleanups: Array<VoidFn> = [];
  for (const trigger of triggers) {
    const cleanup = dispatchOne(trigger, base);
    if (cleanup) cleanups.push(cleanup);
  }
  return cleanups;
}

/**
 * Routes a single trigger to its handler. Synthetic events (`interval`,
 * `visible`, `online`, etc.) go through the `syntheticEvents` registry.
 * Standard DOM events fall through to `attachListener`.
 *
 * Pacing (debounce/throttle) is applied here once, before dispatch, so
 * synthetic and DOM events both receive paced actions. The returned
 * cleanup also cancels any pending paced calls.
 *
 * Native navigation is suppressed for form submits and anchor clicks
 * via `isNativeNavigation`.
 *
 * @returns Cleanup function, or `null` if the trigger has no teardown.
 */
export function dispatchOne(
  trigger: TriggerDef,
  base: Omit<TriggerContext, 'modifiers'>,
): VoidFn | null {
  const paced = applyTiming(base.action, trigger.modifiers);
  const pacedAction: ActionFn = (e) => paced(e);

  // Ensure paced timers cancel on teardown
  const wrapCleanup = (cleanup: VoidFn | null): VoidFn => {
    return () => {
      paced.cancel();
      cleanup?.();
    };
  };

  // Handle synthetic (non-standard) events
  const handler = syntheticEvents[trigger.event];
  if (handler) {
    const cleanup = handler({
      ...base,
      modifiers: trigger.modifiers,
      action: pacedAction,
    });
    return wrapCleanup(cleanup);
  }

  // Standard DOM event listener
  const cleanup = attachListener(
    base.el,
    trigger.event,
    (e: Event) => {
      if (isNativeNavigation(base.el, e)) {
        e.preventDefault();
      }
      pacedAction(e);
    },
    trigger.modifiers,
  );

  return wrapCleanup(cleanup);
}

/**
 * Subscribes to a window-level event and returns a cleanup that
 * removes the listener.
 */
function attachWindowEvent(event: string, action: VoidFn): VoidFn {
  window.addEventListener(event, action);
  return () => {
    window.removeEventListener(event, action);
  };
}

/**
 * Subscribes to `document.visibilitychange`, firing `action` only
 * when the document transitions to the specified state.
 */
function attachVisibilityChange(action: VoidFn, state: 'visible' | 'hidden'): VoidFn {
  const handler = () => {
    if (document.visibilityState === state) {
      action();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
}
