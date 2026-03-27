import { getDirective } from './prefix';

export const SLUG = 'source' as const;

/**
 * Gets the rz-source attribute, which defines the endpoint URL for a reactive store.
 */
export function getStoreSource(el: HTMLElement): string | null {
  return getDirective(el, SLUG);
}
