import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import type { Directive } from '../types';

export const rzSource = {
  existsOn,
  getRawValue,
  getMethodAndUrl,
} as const satisfies Directive<HTMLScriptElement>;

const validSaveMethod = new Set(['POST', 'PUT', 'PATCH']);
const DEFAULT_SAVE_METHOD = 'POST';

function existsOn(el: HTMLScriptElement) {
  return hasDirective(el, 'source');
}

function getRawValue(el: HTMLScriptElement) {
  return getDirectiveValue(el, 'source');
}

/**
 * Gets the `rz-source` attribute and parses to a HTTP method and URL.
 */
function getMethodAndUrl(el: HTMLScriptElement): {
  saveMethod?: string;
  url?: string;
} {
  let saveMethod = DEFAULT_SAVE_METHOD;
  let url: string | undefined;

  const parsed = parseDirectiveValue(getRawValue(el));
  if (!parsed[0]) {
    return { saveMethod, url };
  }

  const [key, val] = parsed[0];
  const upperKey = key.toUpperCase();
  const isKeyValidMethod = validSaveMethod.has(upperKey);

  if (val) {
    // A pair was provided: e.g., "PUT: /api/cart" or "FOO: /api/cart"
    if (isKeyValidMethod) {
      saveMethod = upperKey;
    } else {
      warn(`Invalid save method: '${key}'. Using '${DEFAULT_SAVE_METHOD}'.`);
    }
    url = val;
  } else {
    // A single value was provided: e.g., "PUT" or "/api/cart"
    if (isKeyValidMethod) {
      saveMethod = upperKey;
    } else {
      url = key;
    }
  }

  return { saveMethod, url };
}
