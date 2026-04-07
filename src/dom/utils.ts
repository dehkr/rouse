import { getNestedVal, KEY_BLOCKLIST } from '../core/path';
import { warn } from '../core/shared';
import type { StoreManager } from '../core/store';
import { parseStoreLocator } from '../core/store';
import { applyTiming } from '../core/timing';
import type { InsertMethod } from '../directives/rz-insert';
import type { CleanupFunction, LifecycleEvent } from '../types';
import { applyModifiers, getListenerOptions, resolveListenerTarget } from './modifiers';

export const isAnchor = (el: unknown) => el instanceof HTMLAnchorElement;
export const isElement = (el: unknown) => el instanceof HTMLElement;
export const isForm = (el: unknown) => el instanceof HTMLFormElement;
export const isInput = (el: unknown) => el instanceof HTMLInputElement;
export const isSelect = (el: unknown) => el instanceof HTMLSelectElement;
export const isTextArea = (el: unknown) => el instanceof HTMLTextAreaElement;

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
 * Parse JSON with recursive check that blocks prototype pollution keys.
 */
function safeJSONParse(text: string): unknown {
  return JSON.parse(text, (key, value) => {
    if (KEY_BLOCKLIST.has(key)) {
      warn(`Blocked forbidden key in JSON: "${key}".`);
      return undefined;
    }
    return value;
  });
}

/**
 * Splits an injection string into its key and raw payload components.
 * Supports ?, #, @, and { as payload delimiters.
 */
export function splitInjection(raw: string): {
  key: string;
  rawPayload: string | undefined;
} {
  // Find the first index of ?, #, @, {
  const match = raw.match(/[?#@{]/);

  if (!match || match.index === undefined) {
    return { key: raw.trim(), rawPayload: undefined };
  }

  const i = match.index;
  return {
    key: raw.slice(0, i).trim(),
    rawPayload: raw.slice(i).trim(),
  };
}

/**
 * Checks that a value is an object.
 */
function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Resolves a payload string into a JavaScript value. Uses heuristics to determine
 * if the payload is inline JSON, a DOM ID, a global store, or URL params.
 *
 * @param requireObject - If true (default), enforces that the resolved value is an object.
 */
export function resolvePayload(
  input: string | undefined | null,
  storeManager?: StoreManager,
  requireObject = true,
): Record<string, any> | undefined {
  const value = input?.trim();
  if (!value) return undefined;

  let resolvedValue: any;

  // Store snapshot (@)
  if (value.startsWith('@')) {
    if (!storeManager) {
      warn(`Cannot resolve "${value}" because StoreManager is missing.`);
      return undefined;
    }

    const { storeName, nestedPath } = parseStoreLocator(value);
    const storeData = storeManager.get(storeName);

    if (storeData === undefined) {
      console.warn(
        `[Rouse] Store "${storeName}" not found. Cannot resolve payload: "${value}"`,
      );
      return undefined;
    }

    resolvedValue = nestedPath ? getNestedVal(storeData, nestedPath) : storeData;
  }

  // URL query params (?)
  else if (value.startsWith('?')) {
    const params = new URLSearchParams(value.slice(1));
    resolvedValue = Object.fromEntries(params.entries());
  }

  // DOM script ID (#)
  else if (value.startsWith('#')) {
    const id = value.slice(1);
    const el = document.getElementById(id);
    if (el && el instanceof HTMLScriptElement && el.type === 'application/json') {
      const content = el.textContent?.trim();
      if (content) {
        try {
          resolvedValue = safeJSONParse(content);
        } catch (e) {
          warn(`Invalid JSON in #${id}.`, e);
        }
      }
    } else {
      warn(`#${id} must be a <script type="application/json">.`);
    }
  }

  // Inline JSON object ({)
  else if (value.startsWith('{')) {
    try {
      resolvedValue = safeJSONParse(value);
    } catch (e) {
      warn(`Invalid inline JSON.`, e);
    }
  }

  // Final check
  if (resolvedValue !== undefined) {
    if (!requireObject || isObject(resolvedValue)) {
      return resolvedValue;
    }
    console.warn(
      `[Rouse] Invalid payload: "${value}". Data passed into controllers/methods must resolve to an object. Received type: ${Array.isArray(resolvedValue) ? 'array' : typeof resolvedValue}.`,
    );
  }

  return undefined;
}

/**
 * Factory function to wrap cleanup logic and apply 'CLEANUP' identifier.
 */
export function cleanup(fn: () => void): CleanupFunction {
  return fn as CleanupFunction;
}
