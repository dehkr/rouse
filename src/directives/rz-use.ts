import { getDirective } from '../dom/attributes';

export const USE_SLUG = 'use' as const;

export function getControllerName(el: HTMLElement): string | null {
  return getDirective(el, USE_SLUG);
}
