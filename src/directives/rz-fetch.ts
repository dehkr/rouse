import { parseDirectiveValue } from '../core/parser';
import type { DirectiveSchema } from '../types';
import { getDirectiveValue } from './utils';

export const rzFetch = {
  slug: 'fetch',
  handler: getFetchDirective,
} as const satisfies DirectiveSchema;

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

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
    if (METHODS.has(upper)) {
      result.method = upper;
    } else {
      result.url = key;
    }
  }

  return result;
}
