import { applyTiming } from '../core/timing';
import type { InsertMethod } from '../directives/rz-insert';
import type { CleanupFunction, LifecycleEvent } from '../types';
import { applyModifiers, getListenerOptions, resolveListenerTarget } from './modifiers';

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

/**
 * Dispatches a custom event from an element.
 *
 * @param target - The element to dispatch from
 * @param name - The event name
 * @param detail - The event data
 * @param options - Allows overriding cancelable/bubbles
 */
export function dispatch<T extends string, D = any>(
  target: EventTarget,
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
  target.dispatchEvent(event);
  return event;
}

/**
 * Event listener utility that returns a cleanup function.
 */
export function on<D = any>(
  el: EventTarget,
  name: string,
  callback: (ev: CustomEvent<D>) => void,
  modifiers: string[] = [],
  abortSignal?: AbortSignal,
): () => void {
  const paced = applyTiming(callback, modifiers);
  const options = { ...getListenerOptions(modifiers), abortSignal };

  const listener = (e: Event) => {
    if (applyModifiers(e, el, modifiers)) {
      paced(e as CustomEvent<D>);
    }
  };

  const target = resolveListenerTarget(el as Element, modifiers);
  target.addEventListener(name, listener, options);

  // If a signal is provided, cancel paced functions on abort
  const onAbort = () => paced.cancel();
  if (abortSignal) {
    abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  // Returns a traditional cleanup function
  // Unnecessary in controller context because abort signal is injected and
  // aborted automatically. But this can be used safely for manual cleanup.
  return () => {
    target.removeEventListener(name, listener, options);
    paced.cancel();

    // Prevent memory leaks if manual cleanup is called before the signal aborts
    if (abortSignal) {
      abortSignal.removeEventListener('abort', onAbort);
    }
  };
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
 */
export function cleanup(fn: () => void): CleanupFunction {
  return fn as CleanupFunction;
}
