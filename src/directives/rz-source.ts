import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import type { Directive } from '../types';

export const rzSource = {
  existsOn: (el: Element) => hasDirective(el, 'source'),
  getValue: (el: Element) => getDirectiveValue(el, 'source'),
  getMethodAndUrl,
} as const satisfies Directive;

const validSaveMethod = new Set(['POST', 'PUT', 'PATCH']);
const DEFAULT_SAVE_METHOD = 'POST';

/**
 * Gets the `rz-source` attribute and parses to an HTTP method and URL.
 */
function getMethodAndUrl(el: Element): {
  saveMethod?: string;
  url?: string;
} {
  let saveMethod = DEFAULT_SAVE_METHOD;
  let url: string | undefined;

  const parsed = parseDirectiveValue(getDirectiveValue(el, 'source'));
  if (!parsed[0]) {
    return { saveMethod, url };
  }

  const [key, val] = parsed[0];
  const upperKey = key.toUpperCase();
  const isKeyValidMethod = validSaveMethod.has(upperKey);

  // Pair value (e.g., "PUT: /api/cart" or "FOO: /api/cart")
  if (val) {
    if (isKeyValidMethod) {
      saveMethod = upperKey;
    } else {
      warn(`Invalid save method: '${key}'. Using '${DEFAULT_SAVE_METHOD}'.`);
    }
    url = val;
  } 

  // Single value (e.g., "PUT" or "/api/cart")
  else {
    if (isKeyValidMethod) {
      saveMethod = upperKey;
    } else {
      url = key;
    }
  }

  return { saveMethod, url };
}
