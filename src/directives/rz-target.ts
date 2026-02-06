import { getDirective } from '../dom/attributes';

export const SLUG = 'target' as const;

/**
 * Resolves the target element for an action.
 * @param el - The element triggering the action.
 * @param defaultToSelf - If true, returns host element when no attribute is found.
 */
export function getTarget(el: HTMLElement, defaultToSelf = true): HTMLElement | null {
  const selector = getDirective(el, SLUG);

  if (selector) {
    return document.querySelector(selector);
  }

  return defaultToSelf ? el : null;
}
