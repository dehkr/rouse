import { getNestedVal, KEY_BLOCKLIST } from '../core/path';
import type { StoreManager } from '../core/store';
import { isStoreLocator, parseStoreLocator } from '../core/store';
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
 * Splits a JSON injection string into its key and raw payload
 * components using the `?` delimiter.
 */
export function splitInjection(raw: string): {
  key: string;
  rawPayload: string | undefined;
} {
  const i = raw.indexOf('?');
  if (i === -1) {
    return { key: raw.trim(), rawPayload: undefined };
  }
  return {
    key: raw.slice(0, i).trim(),
    rawPayload: raw.slice(i + 1).trim(),
  };
}

function isObject(val: unknown): val is Record<string, any> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Validates that the parsed result is a plain object before returning value.
 */
function validateJSONObject(parsed: unknown): Record<string, any> | undefined {
  if (isObject(parsed)) {
    return parsed as Record<string, any>;
  }
  console.warn(`[Rouse] Payload must be a JSON object. Received:`, parsed);
  return undefined;
}

/**
 * Resolves a payload string into a JavaScript value. Uses heuristics to determine
 * if the payload is inline JSON, a DOM ID, or a path to a global store.
 */
export function resolvePayload(
  input: string | undefined | null,
  storeManager?: StoreManager,
): Record<string, any> | undefined {
  const value = input?.trim();
  if (!value) return undefined;

  // Quick check for inline JSON object
  if (value.startsWith('{')) {
    try {
      return validateJSONObject(safeJSONParse(value));
    } catch (e) {
      console.warn(`[Rouse] Invalid inline JSON.`, e);
      return undefined;
    }
  }

  // Resolve store protocol (`store:`)
  if (isStoreLocator(value)) {
    if (!storeManager) {
      console.warn(`[Rouse] Cannot resolve "${value}" because StoreManager is missing.`);
      return undefined;
    }

    const { storeName, nestedPath } = parseStoreLocator(value);
    const storeData = storeManager.get(storeName);
    const resolvedValue = nestedPath ? getNestedVal(storeData, nestedPath) : storeData;

    // Check to make sure the value is an object
    if (isObject(resolvedValue)) {
      return resolvedValue;
    } else {
      console.warn(
        `[Rouse] Invalid payload: "${value}". Payloads injected via '?' must resolve to a JSON object. Got ${typeof resolvedValue}.`,
      );
      return undefined;
    }
  }

  // Check if it's an ID for <script type="application/json">
  const el = document.getElementById(value);
  if (el) {
    if (el instanceof HTMLScriptElement && el.type === 'application/json') {
      const content = el.textContent?.trim();
      if (!content) return {};
      try {
        return validateJSONObject(safeJSONParse(content));
      } catch (e) {
        console.warn(`[Rouse] Invalid JSON in #${value}.`, e);
        return undefined;
      }
    }
    console.warn(`[Rouse] #${value} must be <script type="application/json">.`);
    return undefined;
  }

  // If none of the above
  console.warn(`[Rouse] Unable to resolve payload: "${value}".`);
  return undefined;
}
