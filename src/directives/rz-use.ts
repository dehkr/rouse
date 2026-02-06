import { getDirective } from '../dom/attributes';

export const SLUG = 'use' as const;

export function getControllerName(el: HTMLElement): string | null {
  return getDirective(el, SLUG);
}
