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
export function getDirectiveValue(el: HTMLElement, slug: DirectiveSlug): string | null {
  return el.getAttribute(`rz-${slug}`) ?? el.getAttribute(`data-rz-${slug}`);
}

/**
 * Checks if the element has either prefix.
 */
export function hasDirective(el: HTMLElement, slug: DirectiveSlug): boolean {
  return el.hasAttribute(`rz-${slug}`) || el.hasAttribute(`data-rz-${slug}`);
}
