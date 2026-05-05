import { parseTriggers } from '../core/parser';
import type {
  ActionFn,
  BoundCleanupFn,
  InsertMethod,
  LifecycleEvent,
  VoidFn,
} from '../types';
import { applyModifiers, getListenerOptions, resolveListenerTarget } from './modifiers';
import { dispatchOne } from './scheduler';

const elementMap = {
  Anchor: HTMLAnchorElement,
  Form: HTMLFormElement,
  HTML: HTMLElement,
  Input: HTMLInputElement,
  Script: HTMLScriptElement,
  Select: HTMLSelectElement,
  SVG: SVGElement,
  TextArea: HTMLTextAreaElement,
} as const;

type ElementKind = keyof typeof elementMap;

export function is<K extends ElementKind>(
  el: unknown,
  kind: K,
): el is InstanceType<(typeof elementMap)[K]> {
  return el instanceof elementMap[kind];
}

export function isNativeNavigation(el: Element, e: Event): boolean {
  return (
    (e.type === 'submit' && is(el, 'Form')) || (e.type === 'click' && is(el, 'Anchor'))
  );
}

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
 * Handles inserting HTML partials into document
 */
export function insert(
  content: string,
  target: Element,
  method: InsertMethod = 'innerHTML',
) {
  switch (method) {
    case 'delete':
      target.remove();
      break;
    case 'innerHTML':
      target.innerHTML = content;
      break;
    case 'outerHTML':
      target.outerHTML = content;
      break;
    default:
      target.insertAdjacentHTML(method, content);
  }
}

/**
 * Factory function to wrap cleanup logic and apply 'CLEANUP' identifier.
 * Used for directives of `BoundDirective` type.
 */
export function boundCleanup(fn: VoidFn): BoundCleanupFn {
  return fn as BoundCleanupFn;
}
