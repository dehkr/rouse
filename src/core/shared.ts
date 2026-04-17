import type { DirectiveSlug } from '../types';

export const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

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
 * Checks that a value is a plain JavaScript opbject (POJO).
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
 * Safely query within the element boundary (including the element itself)
 */
export function queryTargets<T extends Element = Element>(
  el: Element,
  selector: string,
): T[] {
  const targets = Array.from(el.querySelectorAll<T>(selector));

  // Check if root element itself matches the selector
  if (el.matches(selector)) {
    targets.unshift(el as T);
  }

  return targets;
}

/**
 * Recursively freezes an object to prevent any further mutations.
 * Optimized for configuration (plain objects and arrays).
 */
export function deepFreeze<T extends object>(obj: T, seen = new WeakSet()): Readonly<T> {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj as Readonly<T>;
  }

  if (Object.isFrozen(obj) || seen.has(obj)) {
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
