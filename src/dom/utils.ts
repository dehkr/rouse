import { getNestedVal, KEY_BLOCKLIST } from '../core/path';
import type { StoreManager } from '../core/store';
import { parseStoreLocator } from '../core/store';
import type { InsertMethod } from '../directives/rz-insert';

export const isElement = (el: unknown) => el instanceof HTMLElement;
export const isForm = (el: unknown) => el instanceof HTMLFormElement;
export const isInput = (el: unknown) => el instanceof HTMLInputElement;
export const isSelect = (el: unknown) => el instanceof HTMLSelectElement;
export const isTextArea = (el: unknown) => el instanceof HTMLTextAreaElement;

/**
 * Dispatches a custom event from an element.
 *
 * @param el - The element to dispatch from
 * @param name - The event name
 * @param detail - The event data
 * @param options - Allows overriding cancelable/bubbles
 */
export function dispatch(
  el: HTMLElement,
  name: string,
  detail: any = {},
  options: CustomEventInit = {},
): CustomEvent {
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
 * Handles inserting HTML partials into document
 */
export function insert(target: HTMLElement, content: string, method: InsertMethod) {
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
      console.warn(`[Rouse] Blocked forbidden key in JSON: "${key}".`);
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
      console.warn(`[Rouse] Cannot resolve "${value}" because StoreManager is missing.`);
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
          console.warn(`[Rouse] Invalid JSON in #${id}.`, e);
        }
      }
    } else {
      console.warn(`[Rouse] #${id} must be a <script type="application/json">.`);
    }
  }

  // Inline JSON object ({)
  else if (value.startsWith('{')) {
    try {
      resolvedValue = safeJSONParse(value);
    } catch (e) {
      console.warn(`[Rouse] Invalid inline JSON.`, e);
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
