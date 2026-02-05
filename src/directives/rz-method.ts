import { getDirective } from '../dom/attributes';

export const METHOD_SLUG = 'method' as const;

export function getMethod(el: HTMLElement): string {
  // Check directive, then attribute, then default
  return getDirective(el, METHOD_SLUG) || el.getAttribute('method') || 'GET';
}
