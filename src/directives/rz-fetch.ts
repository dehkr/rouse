import { parseDirective } from '../core/parser';
import { getDirective } from './prefix';

export const SLUG = 'fetch' as const;

/**
 * Parses the rz-fetch attribute into a URL and method.
 */
export function getFetchDirective(el: HTMLElement): { url?: string; method?: string } {
  const fetchRaw = getDirective(el, SLUG);
  if (!fetchRaw) return {};

  const parsed = parseDirective(fetchRaw);
  if (parsed[0]) {
    const [key, val] = parsed[0];
    if (val) {
      return { method: key.toUpperCase(), url: val };
    }
    return { url: key };
  }
  return {};
}
