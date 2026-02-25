import { getDirective } from './prefix';

export const SLUG = 'store' as const;

/**
 * Extracts the store name from a <script> element's rz-store directive.
 */
export function getStoreName(el: HTMLScriptElement): string | null {
  return getDirective(el, SLUG);
}
