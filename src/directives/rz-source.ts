import type { DirectiveSchema } from '../types';
import { getDirectiveValue } from './utils';

export const rzSource = {
  slug: 'source',
  handler: getStoreSource,
} as const satisfies DirectiveSchema<HTMLScriptElement>;

/**
 * Gets the `rz-source` attribute, which defines the endpoint URL for a store.
 */
export function getStoreSource(el: HTMLScriptElement): string | null {
  return getDirectiveValue(el, 'source');
}
