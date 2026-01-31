import type { BindableValue } from '../types';

export const isElement = (el: unknown) => el instanceof HTMLElement;
export const isInput = (el: unknown) => el instanceof HTMLInputElement;
export const isSelect = (el: unknown) => el instanceof HTMLSelectElement;
export const isTextArea = (el: unknown) => el instanceof HTMLTextAreaElement;

/**
 * Handles injecting HTML partials into document
 */
export function swap(el: Element, html: string, method: string) {
  method === 'innerHTML' || method === 'outerHTML'
    ? (el[method] = html)
    : el.insertAdjacentHTML(method as InsertPosition, html);
}

// Prevent prototype pollution
const KEY_BLOCKLIST = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Resolve a dot-notation path to a value
 */
export function getNestedVal(obj: any, path: string | undefined): BindableValue {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Set a value at a dot-notation path
 */
export function setNestedVal(obj: any, path: string | undefined, value: any): void {
  if (!obj || !path) return;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts.slice(0, -1)) {
    if (KEY_BLOCKLIST.has(part)) return;

    // Auto-initialize missing parts or overwrite primitive types to allow traversal
    if (
      !(part in current) ||
      typeof current[part] !== 'object' ||
      current[part] == null
    ) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastKey = parts.at(-1);
  if (lastKey !== undefined && !KEY_BLOCKLIST.has(lastKey)) {
    current[lastKey] = value;
  }
}

/**
 * Safely parses JSON from a string or a DOM element reference.
 *
 * @param input - JSON string or id of script element containing JSON (e.g. "#app-data")
 */
export function safeParse(input: string | undefined | null): any {
  if (!input) return {};

  const value = input.trim();
  if (!value) return {};

  if (value.startsWith('#')) {
    try {
      const el = document.querySelector(value);
      if (el) {
        const jsonContent = (el.textContent || '').trim();
        return jsonContent ? JSON.parse(jsonContent) : {};
      } else {
        console.warn(`[Rouse] Config element not found: "${value}"`);
        return {};
      }
    } catch (e) {
      console.warn(`[Rouse] Error parsing config from "${value}":`, e);
      return {};
    }
  }

  try {
    return JSON.parse(value);
  } catch (e) {
    console.warn(`[Rouse] Failed to parse JSON attribute:`, e);
    return {};
  }
}
