import type { DirectiveSlug } from '.';

let useDataAttributes = false;

/**
 * Configures the directive prefix strategy.
 * If false (default) directives use "rz-" prefix.
 */
export function configureDirectivePrefix(useData: boolean) {
  useDataAttributes = useData;
}

/**
 * Generates directive name according to prefix config.
 */
export function name(slug: DirectiveSlug): string {
  return useDataAttributes ? `data-rz-${slug}` : `rz-${slug}`;
}

/**
 * Generates a CSS selector for a directive.
 */
export function selector(slug: DirectiveSlug): string {
  return `[${name(slug)}]`;
}

/**
 * Wrapper for getAttribute that respects the directive prefix config.
 */
export function getDirective(el: HTMLElement, slug: DirectiveSlug): string | null {
  return el.getAttribute(name(slug));
}

/**
 * Wrapper for hasAttribute that respects the directive prefix config.
 */
export function hasDirective(el: HTMLElement, slug: DirectiveSlug): boolean {
  return el.hasAttribute(name(slug));
}
