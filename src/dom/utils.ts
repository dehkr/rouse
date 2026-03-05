import { KEY_BLOCKLIST } from '../core/path';
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
 * Splits a JSON injection string into its key and raw payload components.
 */
export function splitInjection(raw: string): {
  key: string;
  rawPayload: string | undefined;
} {
  const i = raw.indexOf('#');
  if (i === -1) {
    return { key: raw.trim(), rawPayload: undefined };
  }
  return {
    key: raw.slice(0, i).trim(),
    rawPayload: raw.slice(i + 1).trim(),
  };
}

/**
 * Validates that the parsed result is strictly a plain object.
 */
function validateObject(parsed: unknown): Record<string, any> | undefined {
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, any>;
  }
  console.warn(`[Rouse] Payload must be a JSON object. Received:`, parsed);
  return undefined;
}

/**
 * Resolves a payload string into a JavaScript value.
 * Uses heuristics to determine if the payload is inline JSON or a DOM ID.
 */
export function resolvePayload(
  input: string | undefined | null,
): Record<string, any> | undefined {
  const value = input?.trim();
  if (!value) return undefined;

  // Quick check for inline JSON object
  if (value.startsWith('{')) {
    try {
      return validateObject(safeJSONParse(value));
    } catch (e) {
      console.warn(`[Rouse] Invalid inline JSON.`, e);
      return undefined;
    }
  }

  // Check if it's a script ID
  const el = document.getElementById(value);
  if (el) {
    if (el instanceof HTMLScriptElement && el.type === 'application/json') {
      const content = el.textContent?.trim();
      if (!content) return {};
      try {
        return validateObject(safeJSONParse(content));
      } catch (e) {
        console.warn(`[Rouse] Invalid JSON in #${value}.`, e);
        return undefined;
      }
    }
    console.warn(`[Rouse] #${value} must be <script type="application/json">.`);
    return undefined;
  }

  console.warn(`[Rouse] "${value}" is not a valid JSON object or element ID.`);
  return undefined;
}
