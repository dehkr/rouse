import { getDirectiveValue } from '../core/attributes';
import { STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue, parseStoreRef } from '../core/parser';
import type { ConfigDirective } from '../types';

/**
 * Resolves `rz-deposit` into store names for JSON payload routing via a fetch response
 * or an unnamed stream message.
 *
 * Whole stores only, comma separated. Without it, a payload deposits nothing.
 *
 * - `data-rz-deposit="@cart"`
 * - `data-rz-deposit="@cart, @status"`
 *
 * @param overrideValue - Takes precedence over the attribute (a server `Rouse-Deposit` header).
 */
function getConfig(el: Element, overrideValue?: string | null): string[] {
  const value = overrideValue || getDirectiveValue(el, 'deposit');
  const label = __DEV__ ? (overrideValue ? 'Rouse-Deposit' : 'rz-deposit') : '';

  return parseDirectiveValue(value).flatMap(([key]) => {
    if (!key.startsWith(STORE_PREFIX)) {
      __DEV__ && warn(`${label}: '${key}' is not a store reference. Use '@name'.`, el);
      return [];
    }

    const ref = parseStoreRef(key, 'deposit');
    if (!ref) return [];

    if (ref.nestedPath) {
      __DEV__ &&
        warn(`${label}: '${key}' targets a slice. A deposit writes a whole store.`, el);
      return [];
    }

    return [ref.source];
  });
}

export const rzDeposit = { getConfig } as const satisfies ConfigDirective<string[]>;
