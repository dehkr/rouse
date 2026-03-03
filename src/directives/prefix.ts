import type { DirectiveSlug } from '.';

/**
 * Generates a CSS selector that matches both prefix styles.
 * Example: "[rz-bind], [data-rz-bind]"
 */
export function selector(slug: DirectiveSlug): string {
  return `[rz-${slug}], [data-rz-${slug}]`;
}

/**
 * Gets the directive value, checking the data- attribute first,
 * then falling back to the shorthand prefix.
 */
export function getDirective(
  el: HTMLElement,
  slug: DirectiveSlug,
): string | null {
  return el.getAttribute(`data-rz-${slug}`) ?? el.getAttribute(`rz-${slug}`);
}

/**
 * Checks if the element has either prefix.
 */
export function hasDirective(el: HTMLElement, slug: DirectiveSlug): boolean {
  return el.hasAttribute(`data-rz-${slug}`) || el.hasAttribute(`rz-${slug}`);
}
