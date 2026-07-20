import type { DirectiveSlug, Scope } from '../types';

export const EMPTY_SCOPE = {} as Scope;

export function kebabToCamel(str: string) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

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
