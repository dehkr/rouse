import { getDirectiveValue } from '../core/shared';
import type { DirectiveSchema } from '../types';

export const rzStore = {
  slug: 'store',
  handler: getStoreName,
} as const satisfies DirectiveSchema<HTMLScriptElement>;

/**
 * Extracts the store name from a <script> element's `rz-store`` directive.
 */
export function getStoreName(el: HTMLScriptElement): string | null {
  return getDirectiveValue(el, 'store');
}
