import type { DirectiveSlug } from '../types';
import { isDirectiveSlug } from './constants';

const PREFIX = 'data-rz-';

/**
 * Generates a CSS selector matching a directive, optionally qualified by `tag`.
 */
export function directiveSelector(slug: DirectiveSlug, tag = ''): string {
  return `${tag}[${PREFIX}${slug}]`;
}

/**
 * Gets the directive value associated with a specific element. Returns `null` if
 * the directive isn't present.
 */
export function getDirectiveValue(el: Element, slug: DirectiveSlug): string | null {
  return el.getAttribute(`${PREFIX}${slug}`);
}

/**
 * Checks if the element has a specific directive.
 */
export function hasDirective(el: Element, slug: DirectiveSlug): boolean {
  return el.hasAttribute(`${PREFIX}${slug}`);
}

/** Returns the `data-rz-*` attribute names on `el` that don't name a directive. */
export function unknownDirectiveNames(el: Element): string[] {
  return el
    .getAttributeNames()
    .filter(
      (name) => name.startsWith(PREFIX) && !isDirectiveSlug(name.slice(PREFIX.length)),
    );
}

/**
 * Queries within the element boundary, including the element itself. Returns an
 * empty array for an invalid selector rather than throwing.
 */
export function queryTargets<T extends Element = Element>(
  el: Element,
  selector: string,
): T[] {
  try {
    const targets = Array.from(el.querySelectorAll<T>(selector));
    if (el.matches(selector)) {
      targets.unshift(el as T);
    }
    return targets;
  } catch {
    return [];
  }
}
