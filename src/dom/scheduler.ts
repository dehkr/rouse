import { getApp, type RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { warn } from '../core/shared';
import { applyTiming, isTimeModifier, parseTime } from '../core/timing';
import type { ActionFn, LifecycleEvent, TriggerDef, VoidFn } from '../types';
import { applyModifiers, getListenerOptions, resolveListenerTarget } from './modifiers';
import { isNativeNavigation } from './utils';

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
 * Coordinates `rz-wake` activation strategies using the unified event engine.
 * All strategies must be satisfied before `onWake` fires. If no strategies
 * are provided it fires immediately.
 *
 * @param el - The controller element awaiting activation.
 * @param triggers - Parsed TriggerDef array from `parseTriggers`.
 * @param onWake - Invoked once when all strategies have been satisfied.
 * @returns A master cleanup function to abort wake strategies if the element unmounts early.
 */
export function attachWakeStrategies(
  el: Element,
  triggers: TriggerDef[],
  onWake: VoidFn,
): VoidFn {
  let pending = triggers.length;
  if (pending === 0) {
    onWake();
    return () => {};
  }

  let isAwake = false;
  const cleanups: VoidFn[] = [];

  // Wake triggers only when all conditions are satisfied (AND logic)
  const satisfy = () => {
    if (isAwake) return;
    pending--;

    if (pending === 0) {
      isAwake = true;
      cleanups.forEach((cleanup) => cleanup());
      onWake();
    }
  };

  for (const trigger of triggers) {
    let satisfied = false;

    const action = () => {
      if (satisfied) return;
      satisfied = true;
      satisfy();
    };

    const cleanup = dispatchOne(trigger, { el, action, app: undefined });
    if (cleanup) cleanups.push(cleanup);
  }

  // Return a master cleanup in case the element is destroyed before waking
  return () => {
    if (!isAwake) {
      cleanups.forEach((cleanup) => cleanup());
    }
  };
}

// ============================== SYNTHETIC EVENT REGISTRY ===============================

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
  /** Fires as soon as the DOM node can be interacted with */
  dom: ({ action }) => attachDocStateEvent('dom', action),

  /** Fires when all assets (images, etc.) are fully loaded */
  load: ({ action }) => attachDocStateEvent('load', action),

  /** Fires when the RouseApp instance is fully initialized */
  ready: ({ el, app, action }) => {
    const inst = app || getApp(el);
    if (!inst) return null;

    if (inst.isReady) {
      action();
      return null;
    }

    inst.root.addEventListener('rz:app:ready', action, { once: true });
    return () => inst.root.removeEventListener('rz:app:ready', action);
  },

  /** Fires once after a specified period */
  delay: (ctx) => attachTimingEvent('delay', ctx),

  /** Repeating timer */
  interval: (ctx) => attachTimingEvent('interval', ctx),

  /** Explicit no-op (opts the directive out of all auto-binding) */
  none: () => null,

  /** Connectivity */
  online: ({ action }) => attachWindowEvent('online', action),
  offline: ({ action }) => attachWindowEvent('offline', action),

  /** Document visibility (tab switch / minimize) */
  'page-visible': ({ action }) => attachVisibilityChange('visible', action),
  'page-hidden': ({ action }) => attachVisibilityChange('hidden', action),

  /** Page show (initial load + bfcache restore) */
  back: ({ action }) => attachWindowEvent('pageshow', action),

  /** Listens to a media query, supports `.once` */
  media: ({ el, modifiers, action }) => {
    const query = modifiers.find((m) => m.startsWith('(') && m.endsWith(')'));
    const isOnce = modifiers.includes('once');

    if (!query) {
      warn(`A valid query modifier in parentheses is required for 'media' on`, el);
      return null;
    }

    const mql = window.matchMedia(query);
    let hasFired = false;
    let cleanup: VoidFn = () => {};

    const handleMatch = () => {
      if (isOnce && hasFired) return;
      hasFired = true;
      action();
      if (isOnce) cleanup();
    };

    if (mql.matches) {
      handleMatch();
      if (isOnce) return null;
    }

    const changeHandler = (e: MediaQueryListEvent) => {
      if (e.matches) handleMatch();
    };

    mql.addEventListener('change', changeHandler);
    cleanup = () => mql.removeEventListener('change', changeHandler);

    return cleanup;
  },

  /** Element intersection with the viewport, supports `.once` */
  intersect: ({ el, modifiers, action }) => {
    const isOnce = modifiers.includes('once');
    let hasFired = false;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (isOnce && hasFired) return;
          hasFired = true;
          action();

          if (isOnce) {
            observer.disconnect();
          }
        }
      });
    });

    observer.observe(el);

    return () => observer.disconnect();
  },

  /** Aggregate proxy for 'mouseover', 'focusin', or 'touchstart', supports `.once` */
  interaction: ({ el, modifiers, action }) => {
    const isOnce = modifiers.includes('once');
    const triggers = ['mouseover', 'focusin', 'touchstart'];
    let hasFired = false;

    const handler = (e: Event) => {
      if (isOnce && hasFired) return;
      hasFired = true;

      // Pass the event along so modifiers or the underlying action can use it
      action(e as any);

      if (isOnce) cleanup();
    };

    const cleanup = () => {
      triggers.forEach((evt) => el.removeEventListener(evt, handler));
    };

    triggers.forEach((evt) => el.addEventListener(evt, handler, { passive: true }));

    return cleanup;
  },

  /** window.requestIdleCallback (one-time execution) */
  idle: ({ action }) => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => action());
      return () => window.cancelIdleCallback(id);
    } else {
      // Fallback for Safari since it doesn't support requestIdleCallback (as of May 2026)
      const id = window.setTimeout(() => action(), 1);
      return () => window.clearTimeout(id);
    }
  },
};

// =============================== SYNTHETIC EVENT HELPERS ===============================

/**
 * Helper that fires either window 'load' or document 'DOMContentLoaded' event.
 * Returns a cleanup function if a listener had to be attached.
 */
function attachDocStateEvent(type: 'dom' | 'load', callback: VoidFn): VoidFn | null {
  const isDom = type === 'dom';
  const isReady = isDom
    ? document.readyState !== 'loading'
    : document.readyState === 'complete';

  if (isReady) {
    callback();
    return null;
  }

  const target = isDom ? document : window;
  const event = isDom ? 'DOMContentLoaded' : 'load';

  target.addEventListener(event, callback, { once: true });

  return () => target.removeEventListener(event, callback);
}

/**
 * Helper for the `delay` and `interval` synthetic event functions.
 */
function attachTimingEvent(type: 'delay' | 'interval', ctx: TriggerContext) {
  const timeModifier = ctx.modifiers.find(isTimeModifier);

  if (!timeModifier) {
    warn(`Missing timing modifier for '${type}' on`, ctx.el);
    return null;
  }

  const ms = parseTime(timeModifier);
  if (ms <= 0) return null;

  const setup = type === 'delay' ? window.setTimeout : window.setInterval;
  const clear = type === 'delay' ? window.clearTimeout : window.clearInterval;

  const id = setup(ctx.action, ms);
  return () => clear(id);
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
 * Subscribes to the document `visibilitychange` event, firing `action`
 * when the document transitions to the specified state.
 */
function attachVisibilityChange(state: 'visible' | 'hidden', action: ActionFn): VoidFn {
  const handler = (e: Event) => {
    if (document.visibilityState === state) {
      action(e);
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
}
