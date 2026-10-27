import { getApp, type RouseApp } from '../core/app';
import { getDirectiveValue } from '../core/attributes';
import { STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseStoreRef, parseTriggers } from '../core/parser';
import { getPathRoot } from '../core/path';
import { applyTiming, parseTime } from '../core/timing';
import { SCOPE_SELECTOR } from '../directives/rz-scope';
import { subscribeNamed } from '../net/sse-engine';
import type {
  ActionFn,
  EventCallback,
  ListenerOptions,
  SseMessageDetail,
  TriggerArg,
  TriggerDef,
  TriggerDescriptor,
  TriggerModifiers,
  VoidFn,
} from '../types';
import { isScopeAwake } from './binder';
import { applyModifiers, resolveListenerTarget } from './modifiers';

interface TriggerContext {
  el: Element;
  app: RouseApp;
  /** The source's argument, resolved from markup or passed by the caller. */
  arg?: TriggerArg;
  options: TriggerModifiers;
  action: ActionFn;
  /**
   * Whether to suppress the browser's native navigation before running the action.
   *
   * Defaults to `true`: directives on anchors and forms take ownership of the
   * interaction. `app.on` and `rz-wake` default to `false` — a programmatic
   * listener observes an element rather than taking control of it, and a wake gate
   * only watches for the moment to activate. Those callers can opt in with the
   * `prevent` modifier.
   */
  suppressNavigation?: boolean;
}

type TriggerSourceHandler = (ctx: TriggerContext) => VoidFn | null;

/**
 * A trigger source in the registry. `fromArg` turns the bracketed argument from HTML
 * into the source's typed argument. Without it, the text is used as written. `null` means
 * the argument was invalid and already reported, so nothing attaches. `undefined` leaves
 * the source to report a missing argument itself.
 */
interface TriggerSource {
  fromArg?: (arg: string, el: Element) => TriggerArg | undefined | null;
  attach: TriggerSourceHandler;
}

/** Checks for native anchor or form element navigation events. */
function isNativeNavigation(el: Element, e: Event): boolean {
  return (
    (e.type === 'submit' && el instanceof HTMLFormElement) ||
    (e.type === 'click' && el instanceof HTMLAnchorElement)
  );
}

/**
 * Attaches a DOM event listener, applying the parsed modifiers: listener options,
 * event-argument filters, and target resolution. Execution timing is not applied here;
 * `dispatchTrigger`, its only caller, wraps the callback before calling in.
 *
 * `once` is enforced manually rather than natively so a modifier-filtered event doesn't
 * consume the listener. Trigger sources get their own via `attachTriggerSource`.
 *
 * @returns Cleanup function that removes the listener.
 */
function attachListener<D = any>(
  el: Element,
  name: string,
  callback: (ev: CustomEvent<D>) => void,
  triggerOptions: TriggerModifiers,
  app: RouseApp,
): VoidFn {
  const { capture, once, passive } = triggerOptions;
  const listener = (e: Event) => {
    if (!applyModifiers(e, el, triggerOptions)) return;

    // Native `once` would consume the listener on filtered-out events,
    // so removal happens here, after the modifiers pass.
    if (once) {
      cleanup();
    }
    callback(e as CustomEvent<D>);
  };

  const target = resolveListenerTarget(el, triggerOptions, app);
  const cleanup = () => {
    target.removeEventListener(name, listener, capture);
  };

  target.addEventListener(name, listener, { capture, passive });

  return cleanup;
}

/**
 * Attaches a listener for one event name, or one trigger source with its argument,
 * and returns its cleanup.
 *
 * Backs `app.on`, which binds it to the app-lifetime abort signal. `app` is
 * threaded to the trigger engine so trigger sources and the `root` listen target
 * resolve the owning instance without a DOM lookup, which also makes them work on
 * non-element targets such as `window`.
 *
 * @example
 * app.on(el, 'click', handleClick, { debounce: 500 });
 * app.on({ interval: '10s' }, poll);
 */
export function on(
  target: EventTarget,
  event: string | TriggerDescriptor,
  callback: EventCallback<any>,
  options: ListenerOptions,
  app: RouseApp,
): VoidFn {
  const { signal, ...modifiers } = options;

  // Bail before attaching on an already-aborted signal. Otherwise the
  // listener attaches and the abort event never fires to remove it.
  if (signal?.aborted) {
    return () => {};
  }

  let name: string;
  let arg: TriggerArg | undefined;

  if (typeof event === 'string') {
    name = event.trim();

    // Trigger grammar is parsed out of directive values only
    __DEV__ &&
      /\||-\[/.test(name) &&
      warn(
        `'${name}' looks like Rouse trigger syntax, which isn't parsed in app.on. Pass a trigger's argument with its name and modifiers as options: app.on({ sse: 'late' }, fn, { once: true }).`,
        target,
      );
  } else {
    const keys = Object.keys(event);
    const [key] = keys;

    // An empty or multi-key object names no single trigger, so nothing binds
    if (key === undefined || keys.length > 1) {
      __DEV__ &&
        warn(
          `app.on expected a trigger source with its argument, such as { interval: '10s' }, but got an object with ${keys.length} keys.`,
          target,
        );
      return () => {};
    }

    name = key;
    arg = event[key as keyof TriggerDescriptor];
  }

  // An object with a `handleEvent` method can be used as the listener, mirroring
  // `addEventListener`. Resolved per call so it can be swapped after binding. Also,
  // provide a custom event when Rouse trigger sources don't fire one (which is most of
  // them). This is consistent with `rz-on`.
  const action: ActionFn =
    typeof callback === 'function'
      ? (e?: Event) => callback(e ?? new CustomEvent(name))
      : (e?: Event) => callback.handleEvent(e ?? new CustomEvent(name));

  const cleanup = dispatchTrigger(
    { event: name, options: modifiers },
    { el: target as Element, app, arg, action, suppressNavigation: false },
  );

  signal?.addEventListener('abort', cleanup, { once: true });

  return cleanup;
}

/**
 * Routes a single trigger to its handler. Trigger sources go through the
 * `triggerSources` registry. Standard DOM events fall through to `attachListener`.
 *
 * Timed execution (debounce/throttle) is applied here once, before dispatch, so
 * trigger sources and DOM events both receive timed actions. The returned cleanup
 * also cancels any pending timed calls.
 *
 * Native navigation is suppressed for form submits and anchor clicks unless the
 * caller opts out with `suppressNavigation: false`, which `app.on` and
 * `attachWakeStrategies` do.
 *
 * A source's argument comes from the trigger's own bracketed text when it has one,
 * otherwise from `base.arg`, which callers pass already typed.
 *
 * @returns Cleanup function. A no-op when the trigger's argument was invalid.
 */
export function dispatchTrigger(
  trigger: TriggerDef,
  base: Omit<TriggerContext, 'options'>,
): VoidFn {
  const timed = applyTiming(base.action, trigger.options);
  const suppressNavigation = base.suppressNavigation ?? true;

  const wrapCleanup = (cleanup: VoidFn | null): VoidFn => {
    return () => {
      timed.cancel();
      cleanup?.();
    };
  };

  const source = triggerSources[trigger.event];
  if (source) {
    let arg = base.arg;

    if (trigger.arg !== undefined) {
      const resolved = source.fromArg
        ? source.fromArg(trigger.arg, base.el)
        : trigger.arg;
      if (resolved === null) return () => {};
      arg = resolved;
    }

    const cleanup = attachTriggerSource(source.attach, {
      ...base,
      arg,
      options: trigger.options,
      action: timed,
    });

    return wrapCleanup(cleanup);
  }

  const cleanup = attachListener(
    base.el,
    trigger.event,
    (e: Event) => {
      if (suppressNavigation && isNativeNavigation(base.el, e)) {
        e.preventDefault();
      }
      timed(e);
    },
    trigger.options,
    base.app,
  );

  return wrapCleanup(cleanup);
}

/**
 * Runs a trigger source with `once` enforced centrally, so no source hand-rolls it.
 * Teardown runs before the action, matching `attachListener`, so a throwing action
 * still detaches.
 *
 * A source can fire while it's still attaching (an already-matching `media` query,
 * an already-loaded page) before its teardown exists, so it checks post-attach.
 */
function attachTriggerSource(
  handler: TriggerSourceHandler,
  ctx: TriggerContext,
): VoidFn | null {
  if (!ctx.options.once) {
    return handler(ctx);
  }

  const action = ctx.action;
  let cleanup: VoidFn | null = null;
  let fired = false;

  ctx.action = (e?: Event) => {
    if (fired) return;
    fired = true;
    cleanup?.();
    action(e);
  };

  cleanup = handler(ctx);
  if (fired) {
    cleanup?.();
  }

  return cleanup;
}

/**
 * Coordinates `rz-wake` activation strategies using the unified event engine.
 * All strategies must be satisfied before `onWake` fires. If no strategies
 * are provided it fires immediately.
 *
 * @param el - The scope element awaiting activation.
 * @param triggers - Parsed TriggerDef array from `parseTriggers`.
 * @param onWake - Invoked once when all strategies have been satisfied.
 * @returns A master cleanup function to abort wake strategies if the element unmounts early.
 */
export function attachWakeStrategies(
  el: Element,
  app: RouseApp,
  triggers: TriggerDef[],
  onWake: VoidFn,
): VoidFn {
  let pending = triggers.length;
  if (pending === 0) {
    onWake();
    return () => {};
  }

  let isAwake = false;
  let cleanups: VoidFn[] = [];
  const teardown = () => cleanups.forEach((cleanup) => cleanup());

  // Wake triggers only when all conditions are satisfied (AND logic). It's the one
  // directive where whitespace means AND, and it isn't configurable: a gate that wakes
  // on any of several signals needs a source that fans out behind one trigger, like
  // `interact` does.
  const satisfy = () => {
    if (isAwake) return;
    pending--;

    if (pending === 0) {
      isAwake = true;
      teardown();
      onWake();
    }
  };

  cleanups = triggers.map((trigger) => {
    let satisfied = false;

    // A wake gate observes the element to decide when to activate; it doesn't take
    // ownership of it, so a `submit` or `click` gate must not swallow the navigation.
    return dispatchTrigger(trigger, {
      el,
      app,
      suppressNavigation: false,
      action: () => {
        if (satisfied) return;
        satisfied = true;
        satisfy();
      },
    });
  });

  // A gate can be satisfied while it's still attaching, before its cleanup exists
  if (isAwake) {
    teardown();
  }

  // Return a master cleanup in case the element is destroyed before waking
  return () => {
    if (!isAwake) {
      teardown();
    }
  };
}

/**
 * Universal trigger sources available to directives and `app.on`.
 */
const triggerSources: Record<string, TriggerSource> = {
  /** Fires when the RouseApp instance is fully initialized. */
  ready: {
    attach: ({ app, action }) => {
      // Fires immediately for anything bound after the app is up, which is why there
      // isn't a separate source for "this element was just mounted".
      if (app.isReady) {
        action();
        return null;
      }
      app.root.addEventListener('rz:app:ready', action, { once: true });
      return () => app.root.removeEventListener('rz:app:ready', action);
    },
  },

  /** Fires when the nearest enclosing scope is activated. */
  wake: {
    attach: ({ el, app, action }) => {
      const scopeEl = el.closest<HTMLElement>(SCOPE_SELECTOR);

      if (!scopeEl) {
        __DEV__ && warn(`The 'wake' trigger requires an enclosing scope element.`, el);
        return null;
      }

      if (!getApp(scopeEl, app)) {
        return null;
      }

      // `closest` includes the element, so a scope gated on `wake` waits for itself.
      // The rule stays uniform rather than meaning the parent scope here alone.
      if (__DEV__ && scopeEl === el && gatesOnWake(el)) {
        warn(`The 'wake' trigger can't be used to wake its own scope element.`, el);
      }

      // A directive mounted into a scope that connected earlier missed the event.
      // The listener still attaches, so a later reconnect fires too.
      if (isScopeAwake(scopeEl)) {
        action();
      }

      const onConnect = (e: Event) => {
        // rz:scope:connect bubbles, so a descendant scope's connect would trigger action
        if (e.target === scopeEl) {
          action(e);
        }
      };

      scopeEl.addEventListener('rz:scope:connect', onConnect);
      return () => scopeEl.removeEventListener('rz:scope:connect', onConnect);
    },
  },

  /** Opts the directive out of all auto-binding (explicit no-op). */
  none: { attach: () => null },

  /** Fires once after a specified period (`setTimeout`). */
  timeout: { attach: (ctx) => attachTimingSource('timeout', ctx) },

  /** Repeating timer (`setInterval`). */
  interval: { attach: (ctx) => attachTimingSource('interval', ctx) },

  /** Listens to a media query. */
  media: {
    attach: ({ el, arg: query, action }) => {
      if (typeof query !== 'string' || !query) {
        __DEV__ &&
          warn(
            `The 'media' trigger requires a query: 'media-[(min-width: 640px)]' in HTML, or { media: '(min-width: 640px)' } from app.on.`,
            el,
          );
        return null;
      }

      const mql = window.matchMedia(query);

      // An invalid query doesn't throw; it serializes to 'not all' and never matches
      __DEV__ &&
        mql.media === 'not all' &&
        query !== 'not all' &&
        warn(`Invalid media query '${query}'. It will never match.`, el);

      if (mql.matches) {
        action();
      }

      const changeHandler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          action();
        }
      };

      mql.addEventListener('change', changeHandler);
      return () => mql.removeEventListener('change', changeHandler);
    },
  },

  /** Element intersection with the viewport. */
  intersect: {
    fromArg: (arg) => Number.parseFloat(arg),
    attach: ({ el, arg, action }) => {
      let threshold = arg ?? 0;

      // A value outside 0–1 makes the observer constructor throw
      if (typeof threshold !== 'number' || !(threshold >= 0 && threshold <= 1)) {
        __DEV__ &&
          warn(`Invalid intersect threshold '${arg}'. Use a number from 0 to 1.`, el);
        threshold = 0;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || entry.intersectionRatio < threshold) continue;
            action();
            break;
          }
        },
        { threshold },
      );

      observer.observe(el);
      return () => observer.disconnect();
    },
  },

  /**
   * Fires on pointer or focus interaction with the element. `pointerover` covers
   * mouse, touch, and pen. `focusin` covers keyboard.
   */
  interact: {
    attach: ({ el, action }) => {
      const events = ['pointerover', 'focusin'];
      events.forEach((evt) => el.addEventListener(evt, action, { passive: true }));

      return () => events.forEach((evt) => el.removeEventListener(evt, action));
    },
  },

  /**
   * Fires on a stream message with the named event: `sse-[cart-updated]`.
   * Listens on the element, which hears its own stream and its descendants'.
   * `|root` widens it to every stream in the app.
   *
   * Subscribing is what makes the name observable.
   */
  sse: {
    attach: ({ el, app, arg: name, options, action }) => {
      if (typeof name !== 'string' || !name) {
        __DEV__ &&
          warn(
            `The 'sse' trigger requires an event name: 'sse-[cart-updated]' in HTML, or { sse: 'cart-updated' } from app.on.`,
            el,
          );
        return null;
      }

      subscribeNamed(name);

      // Listens on the element unless given `|root`, so a stream's `done` can't close
      // another stream's `rz-close`. Don't move the default to the root. The name is
      // filtered from the detail rather than spelled into an `rz:sse:${name}` event,
      // which would collide with the connection events and lose its modifiers.
      const target = resolveListenerTarget(el, options, app);

      const handler = (e: Event) => {
        const { detail } = e as CustomEvent<SseMessageDetail>;
        if (detail.event === name) {
          action(e);
        }
      };

      target.addEventListener('rz:sse:message', handler);

      return () => target.removeEventListener('rz:sse:message', handler);
    },
  },

  /** window.requestIdleCallback (one-time execution). */
  idle: {
    attach: ({ action }) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => action());
        return () => window.cancelIdleCallback(id);
      }

      // Safari fallback
      const id = window.setTimeout(action, 1);
      return () => window.clearTimeout(id);
    },
  },

  /**
   * Fires when a store's data is edited. Framework writes are excluded; user
   * writes in one tick coalesce into a single notification.
   */
  edit: {
    // The store sigil `@` is required in HTML, so if missing it falls through to the warning
    fromArg: (arg) =>
      arg.startsWith(STORE_PREFIX) ? arg.slice(STORE_PREFIX.length) : undefined,
    attach: ({ el, app, arg: path, action }) => {
      if (typeof path !== 'string' || !path) {
        __DEV__ &&
          warn(
            `The 'edit' trigger requires a store, e.g. 'edit-[@cart]' in HTML, or { edit: 'cart' } from app.on.`,
            el,
          );
        return null;
      }

      // Warn if the store sigil is used in JS. Store names can't include `@`.
      // The sigil is used only in HTML to indicate a store reference, since HTML
      // doesn't have field names.
      if (path.startsWith(STORE_PREFIX)) {
        __DEV__ &&
          warn(
            `The 'edit' trigger takes a store without '${STORE_PREFIX}' from app.on: { edit: '${path.slice(STORE_PREFIX.length)}' }.`,
            el,
          );
        return null;
      }

      const ref = parseStoreRef(`${STORE_PREFIX}${path}`);
      if (!ref) return null;

      const rootKey = getPathRoot(ref.nestedPath);

      // Filter here, before the timed action. `debounce` forwards only the last
      // batch's roots, so filtering downstream would drop a real edit whenever a
      // different root was touched later in the same window. Only the path's root
      // filters, and an empty batch passes only an untargeted trigger.
      return app.stores._onEdit(ref.source, (roots) => {
        if (!rootKey || roots.has(rootKey)) {
          action();
        }
      });
    },
  },
};

/**
 * Helper for the `timeout` and `interval` trigger sources.
 */
function attachTimingSource(type: 'timeout' | 'interval', ctx: TriggerContext) {
  const delay = ctx.arg;

  if (delay === undefined || delay === '') {
    __DEV__ &&
      warn(
        `The '${type}' trigger requires a delay: '${type}-[5s]' in HTML, or { ${type}: '5s' } from app.on.`,
        ctx.el,
      );
    return null;
  }

  const ms = parseTime(delay);
  if (ms <= 0) {
    return null;
  }

  const setup = type === 'timeout' ? window.setTimeout : window.setInterval;
  const clear = type === 'timeout' ? window.clearTimeout : window.clearInterval;

  const id = setup(ctx.action, ms);
  return () => clear(id);
}

/** Checks if an element's own `rz-wake` includes `wake`. */
function gatesOnWake(el: Element): boolean {
  const value = getDirectiveValue(el, 'wake');
  return !!value && parseTriggers(value).some((trigger) => trigger.event === 'wake');
}
