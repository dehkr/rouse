import { getDirective } from '../dom/attributes';

export const SLUG = 'method' as const;

export function getMethod(el: HTMLElement): string {
  // Check directive, then attribute, then default
  return getDirective(el, SLUG) || el.getAttribute('method') || 'GET';
}
