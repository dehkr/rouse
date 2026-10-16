import { getDirectiveValue } from '../core/attributes';
import { STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue, parseStoreRef, parseStoreValue } from '../core/parser';
import type { ConfigDirective } from '../types';

/**
 * Resolves `rz-deposit` into store names for JSON payload routing via a fetch response
 * or an unnamed stream message.
 *
 * Whole stores only, comma separated. `null` deposits nothing, including on a
 * store script that would otherwise deposit into its own store.
 *
 * - `data-rz-deposit="@cart"`
 * - `data-rz-deposit="@cart, @status"`
 * - `data-rz-deposit="null"`
 *
 * @param overrideValue - Takes precedence over the attribute (a server `Rouse-Deposit` header).
 */
function getConfig(el: Element, overrideValue?: string | null): string[] {
  const value = overrideValue || getDirectiveValue(el, 'deposit');
  const label = __DEV__ ? (overrideValue ? 'Rouse-Deposit' : 'rz-deposit') : '';

  // Checked before the self-store fallback below, so a store script can opt out of it
  if (value?.trim() === 'null') {
    return [];
  }

  // A <script data-rz-store> is its own deposit target, matching how `rz-push`
  // and `rz-pull` resolve a missing subject.
  if (!value?.trim()) {
    const selfName = parseStoreValue(getDirectiveValue(el, 'store'))?.name;
    return selfName ? [selfName] : [];
  }

  const stores: string[] = [];

  for (const [key] of parseDirectiveValue(value)) {
    if (!key.startsWith(STORE_PREFIX)) {
      if (__DEV__) {
        warn(`${label}: '${key}' is not a store reference. Use '@name'.`, el);
      }
      continue;
    }

    const ref = parseStoreRef(key, 'deposit');
    if (!ref) continue;

    if (ref.nestedPath) {
      if (__DEV__) {
        warn(`${label}: '${key}' targets a slice. A deposit writes a whole store.`, el);
      }
      continue;
    }

    stores.push(ref.source);
  }

  return stores;
}

export const rzDeposit = { getConfig } as const satisfies ConfigDirective<string[]>;
