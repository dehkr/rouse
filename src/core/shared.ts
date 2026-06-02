import type { Controller, DirectiveSlug } from '../types';
import {
  DEFAULT_INSERT_METHOD,
  type InsertOperation,
  isInsertMethod,
  STORE_PREFIX,
} from './constants';
import { parseDirectiveValue } from './parser';

export const EMPTY_SCOPE = {} as Controller;

export const warn = (msg: string, ...args: any[]) => {
  console.warn(`[Rouse] ${msg}`, ...args);
};

export const err = (msg: string, ...args: any[]) => {
  console.error(`[Rouse] ${msg}`, ...args);
};

export const kebabToCamel = (str: string) =>
  str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Generates a CSS selector that matches both prefix styles.
 * Example: "[rz-text], [data-rz-text]"
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
  } catch (_e) {
    // Fails gracefully on invalid CSS selectors
    return [];
  }
}

const session = Date.now().toString(36);
let count = 46656;

export const uniqueKey = (prefix = 'rz-') => prefix + session + (count++).toString(36);

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
  if (!value?.trim()) {
    return [{ targets: [hostEl], strategy: DEFAULT_INSERT_METHOD }];
  }

  const parsed = parseDirectiveValue(value);
  if (parsed.length === 0) {
    return [{ targets: [hostEl], strategy: DEFAULT_INSERT_METHOD }];
  }

  const operations: InsertOperation[] = [];

  for (const [key, val] of parsed) {
    // Skip store targets
    if (key.startsWith(STORE_PREFIX) || val?.startsWith(STORE_PREFIX)) {
      continue;
    }

    // "Strategy: Selector"
    if (val) {
      const strategy = isInsertMethod(key) ? key : DEFAULT_INSERT_METHOD;
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
      operations.push({ targets: [], strategy: DEFAULT_INSERT_METHOD });
    } else {
      operations.push({
        targets: Array.from(nodeList),
        strategy: DEFAULT_INSERT_METHOD,
      });
    }
  }

  return operations;
}
