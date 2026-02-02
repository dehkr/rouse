let useDataAttributes = false;

/**
 * Configures the directive prefix strategy.
 * If false (default) directives use "rz-" prefix.
 */
export function configureAttributes(useData: boolean) {
  useDataAttributes = useData;
}

/**
 * Generates directive name according to prefix config.
 */
export function name(slug: string): string {
  return useDataAttributes ? `data-rz-${slug}` : `rz-${slug}`;
}

/**
 * Generates a CSS selector for the directive.
 */
export function selector(slug: string): string {
  return `[${name(slug)}]`;
}

/**
 * Wrapper for getAttribute that respects the directive prefix config.
 */
export function getAttr(el: HTMLElement, slug: string): string | null {
  return el.getAttribute(name(slug));
}

/**
 * Wrapper for hasAttribute that respects the directive prefix config.
 */
export function hasAttr(el: HTMLElement, slug: string): boolean {
  return el.hasAttribute(name(slug));
}
