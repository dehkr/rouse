import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, HTTP_METHODS } from '../core/shared';
import type { DirectiveSchema } from '../types';

export const rzFetch = {
  slug: 'fetch',
  handler: getFetchDirective,
} as const satisfies DirectiveSchema;

type FetchValue = { url?: string; method?: string };

/**
 * Parses the rz-fetch attribute into a URL and method.
 * Supports order-independent comma-separated values:
 *
 * - `rz-fetch="PUT, /api/users"`
 * - `rz-fetch="/api/users, PUT"`
 * - `rz-fetch="PUT"`
 * - `rz-fetch="/api/users"`
 */
export function getFetchDirective(el: HTMLElement): FetchValue {
  const fetchRaw = getDirectiveValue(el, 'fetch');
  const result: FetchValue = {};

  if (!fetchRaw) return result;

  const parsed = parseDirectiveValue(fetchRaw);

  for (const [key] of parsed) {
    if (!key) continue;

    const upper = key.toUpperCase();
    if (HTTP_METHODS.has(upper)) {
      result.method = upper;
    } else {
      result.url = key;
    }
  }

  return result;
}
