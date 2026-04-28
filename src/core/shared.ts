import {
  isInsertMethod,
  type DirectiveSlug,
  type InsertMethod,
  type InsertOperation,
} from '../types';
import { parseDirectiveValue } from './parser';

export const warn = (msg: string, ...args: any[]) => {
  console.warn(`[Rouse] ${msg}`, ...args);
};

export const err = (msg: string, ...args: any[]) => {
  console.error(`[Rouse] ${msg}`, ...args);
};

/**
 * Generates a CSS selector that matches both prefix styles.
 * Example: "[rz-bind], [data-rz-bind]"
 */
export function directiveSelector(slug: DirectiveSlug): string {
  return `[rz-${slug}], [data-rz-${slug}]`;
}

/**
 * Gets the directive value associated with a specific element.
 */
export function getDirectiveValue(el: Element, slug: DirectiveSlug): string | null {
  return el.getAttribute(`rz-${slug}`) ?? el.getAttribute(`data-rz-${slug}`);
}

/**
 * Ensures the value is not null or empty.
 */
export function getDefinedDirectiveValue(el: Element, slug: DirectiveSlug) {
  const value = getDirectiveValue(el, slug);
  if (value === null || value.trim() === '') {
    return null;
  }
  return value.trim();
}

/**
 * Checks if the element has either prefix.
 */
export function hasDirective(el: Element, slug: DirectiveSlug): boolean {
  return el.hasAttribute(`rz-${slug}`) || el.hasAttribute(`data-rz-${slug}`);
}

/**
 * Checks that a value is a plain JavaScript object (POJO).
 * Excludes Arrays, Dates, Maps, and custom class instances.
 */
export function isPlainObject(val: unknown): val is Record<string, any> {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    return false;
  }

  const proto = Object.getPrototypeOf(val);
  // Matches {} (Object.prototype) and Object.create(null)
  return proto === null || proto === Object.prototype;
}

/**
 * Returns true for any MIME type that should be inserted into the DOM.
 */
export function isInsertableType(val: string) {
  return (
    val.includes('text/html') ||
    val.includes('text/plain') ||
    val.includes('image/svg+xml')
  );
}

export function isJsonType(val: string) {
  return val.includes('application/json') || val.includes('+json');
}

export function isFileType(data: unknown) {
  return data instanceof Blob || data instanceof ArrayBuffer;
}

/**
 * Safely query within the element boundary (including the element itself)
 */
export function queryTargets<T extends Element = Element>(
  el: Element,
  selector: string,
): T[] {
  try {
    const targets = Array.from(el.querySelectorAll<T>(selector));
    // Check if root element itself matches the selector
    if (el.matches(selector)) {
      targets.unshift(el as T);
    }
    return targets;
  } catch (e) {
    // Fails gracefully on invalid CSS selectors
    return [];
  }
}

/**
 * Recursively freezes an object to prevent any further mutations.
 * Optimized for configuration (plain objects and arrays).
 */
export function deepFreeze<T extends object>(obj: T, seen = new WeakSet()): Readonly<T> {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj as Readonly<T>;
  }

  if (seen.has(obj)) {
    return obj as Readonly<T>;
  }

  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const value = obj[i];
      if (value && typeof value === 'object') {
        deepFreeze(value, seen);
      }
    }
  } else {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] as keyof typeof obj;
      const value = obj[key];
      if (value && typeof value === 'object') {
        deepFreeze(value, seen);
      }
    }
  }

  return Object.freeze(obj);
}

/**
 * Generate a unique key using crypto if available.
 */
export function uniqueKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const DEFAULT_METHOD: InsertMethod = 'innerHTML';

/**
 * Shared utility to parse target strings into DOM insertion operations.
 *
 * Returns an array of operations to support multi-target updates.
 * Accepts "strategy: selector", "strategy", and/or "selector" values.
 *
 * Defaults to "innerHTML" if strategy is missing and the host element
 * if the selector is missing.
 *
 * - `rz-target="beforebegin: #header"`
 * - `rz-target="beforebegin"`
 * - `rz-error="#output"`
 */
export function resolveInsertOperations(
  value: string | null | undefined,
  hostEl: Element,
  appRoot: Element,
): InsertOperation[] {
  if (!value) {
    return [{ targets: [hostEl], strategy: DEFAULT_METHOD }];
  }

  const parsed = parseDirectiveValue(value);
  if (parsed.length === 0) {
    return [{ targets: [hostEl], strategy: DEFAULT_METHOD }];
  }

  const operations: InsertOperation[] = [];

  for (const [key, val] of parsed) {
    // Skip store targets
    if (key.startsWith('@') || (val && val.startsWith('@'))) continue;

    // "Strategy: Selector"
    if (val) {
      const strategy = isInsertMethod(key) ? key : DEFAULT_METHOD;
      const nodeList = queryTargets(appRoot, val);

      if (nodeList.length === 0) {
        warn(`No targets found for '${val}'.`);
        operations.push({ strategy, targets: [] });
      } else {
        operations.push({
          strategy,
          targets: Array.from(nodeList),
        });
      }
      continue;
    }

    // "Strategy"
    if (isInsertMethod(key)) {
      operations.push({ targets: [hostEl], strategy: key });
      continue;
    }

    // "Selector"
    const nodeList = queryTargets(appRoot, key);
    if (nodeList.length === 0) {
      warn(`No targets found for '${key}'.`);
      operations.push({ targets: [], strategy: DEFAULT_METHOD });
    } else {
      operations.push({
        targets: Array.from(nodeList),
        strategy: DEFAULT_METHOD,
      });
    }
  }

  return operations;
}
