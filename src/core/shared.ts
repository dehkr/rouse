import type { DirectiveSlug, Scope } from '../types';
import {
  DEFAULT_SWAP_METHOD,
  isSwapMethod,
  STORE_PREFIX,
  type SwapOperation,
} from './constants';
import { parseDirectiveValue } from './parser';

export const EMPTY_SCOPE = {} as Scope;

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

export const uniqueKey = (prefix = 'rz_') => prefix + session + (count++).toString(36);

/**
 * Shared utility to parse target strings into DOM swap operations.
 *
 * Returns an array of operations to support multi-target updates.
 * Accepts "method: selector", "method", and/or "selector" values.
 *
 * Defaults to "innerHTML" if method is missing and the host element
 * if the selector is missing.
 *
 * - `rz-target="beforebegin: #header"`
 * - `rz-target="beforebegin"`
 * - `rz-error="#output"`
 */
export function resolveSwapOperations(
  value: string | null | undefined,
  hostEl: Element,
  appRoot: Element,
): SwapOperation[] {
  if (!value?.trim()) {
    return [{ targets: [hostEl], method: DEFAULT_SWAP_METHOD }];
  }

  const parsed = parseDirectiveValue(value);
  if (parsed.length === 0) {
    return [{ targets: [hostEl], method: DEFAULT_SWAP_METHOD }];
  }

  const operations: SwapOperation[] = [];

  for (const [key, val] of parsed) {
    // Skip store targets
    if (key.startsWith(STORE_PREFIX) || val?.startsWith(STORE_PREFIX)) {
      continue;
    }

    // "Strategy: Selector"
    if (val) {
      const method = isSwapMethod(key) ? key : DEFAULT_SWAP_METHOD;
      const nodeList = queryTargets(appRoot, val);

      if (nodeList.length === 0) {
        warn(`No targets found for '${val}'.`);
        operations.push({ method, targets: [] });
      } else {
        operations.push({
          method,
          targets: Array.from(nodeList),
        });
      }
      continue;
    }

    // "Strategy"
    if (isSwapMethod(key)) {
      operations.push({ targets: [hostEl], method: key });
      continue;
    }

    // "Selector"
    const nodeList = queryTargets(appRoot, key);
    if (nodeList.length === 0) {
      warn(`No targets found for '${key}'.`);
      operations.push({ targets: [], method: DEFAULT_SWAP_METHOD });
    } else {
      operations.push({
        targets: Array.from(nodeList),
        method: DEFAULT_SWAP_METHOD,
      });
    }
  }

  return operations;
}
