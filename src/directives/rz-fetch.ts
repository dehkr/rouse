import { parseDirective } from '../core/parser';
import { getDirective } from './prefix';

export const SLUG = 'fetch' as const;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Parses the rz-fetch attribute into a URL and method.
 * Supports order-independent comma-separated values:
 *
 * - `rz-fetch="PUT, /api/users"`
 * - `rz-fetch="/api/users, PUT"`
 * - `rz-fetch="PUT"`
 * - `rz-fetch="/api/users"`
 */
export function getFetchDirective(el: HTMLElement): { url?: string; method?: string } {
  const fetchRaw = getDirective(el, SLUG);
  const result: { method?: string; url?: string } = {};

  if (!fetchRaw) return result;

  const parsed = parseDirective(fetchRaw);

  for (const [key] of parsed) {
    if (!key) continue;

    const upper = key.toUpperCase();
    if (METHODS.has(upper)) {
      result.method = upper;
    } else {
      result.url = key;
    }
  }

  return result;
}
