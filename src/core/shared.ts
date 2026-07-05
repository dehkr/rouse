import type { DirectiveSlug, Scope } from '../types';
import {
  DEFAULT_SWAP_METHOD,
  isSwapMethod,
  STORE_PREFIX,
  type SwapOperation,
  type TargetConfig,
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
    // Fail gracefully on invalid CSS selectors
    return [];
  }
}

const session = Date.now().toString(36);
let count = 46656;

export const uniqueKey = (prefix = 'rz_') => prefix + session + (count++).toString(36);

/**
 * Resolves an `rz-target` value into its routing targets: DOM `swaps`
 * (selectors resolved to elements, each with its swap method) and `@store`
 * target names.
 *
 * Returns an object with two arrays: one containing swap operations and a
 * separate one for store targets. Multi-target updates are supported, including
 * combining DOM and store targets. HTML responses ignore store targets, and JSON
 * responses ignore DOM targets.
 *
 * An empty value defaults to one swap targeting `hostEl`.
 *
 * - `rz-target="afterbegin: #output"`
 * - `rz-target="#output"`
 * - `rz-target="outerHTML"`
 * - `rz-target="@store"`
 * - `rz-target="@status, beforeend: #status"`
 */
export function resolveRouteTargets(
  value: string | null | undefined,
  hostEl: Element,
  appRoot: Element,
): TargetConfig {
  const swaps: SwapOperation[] = [];
  const stores: string[] = [];
  const parsed = value?.trim() ? parseDirectiveValue(value) : [];

  if (parsed.length === 0) {
    swaps.push({ targets: [hostEl], method: DEFAULT_SWAP_METHOD });
    return { swaps, stores };
  }

  for (const [key, val] of parsed) {
    // Store target: collect the name for the JSON store router, not a DOM swap.
    const store = key.startsWith(STORE_PREFIX)
      ? key
      : val?.startsWith(STORE_PREFIX)
        ? val
        : '';

    // @store target
    if (store) {
      stores.push(store.slice(1));
    }

    // "Method: Selector"
    else if (val) {
      swaps.push({
        method: isSwapMethod(key) ? key : DEFAULT_SWAP_METHOD,
        targets: queryEls(appRoot, val),
      });
    }

    // "Method" alone (uses host element)
    else if (isSwapMethod(key)) {
      swaps.push({ targets: [hostEl], method: key });
    }

    // "Selector" alone (uses default method)
    else {
      swaps.push({ targets: queryEls(appRoot, key), method: DEFAULT_SWAP_METHOD });
    }
  }

  return { swaps, stores };
}

function queryEls(appRoot: Element, selector: string): Element[] {
  const targets = Array.from(queryTargets(appRoot, selector));
  __DEV__ && targets.length === 0 && warn(`No targets found for '${selector}'.`);

  return targets;
}
