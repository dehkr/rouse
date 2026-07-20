import {
  DEFAULT_SWAP_METHOD,
  isSwapMethod,
  STORE_PREFIX,
  type SwapOperation,
  type TargetConfig,
} from '../core/constants';
import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, queryTargets, warn } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'target' as const satisfies DirectiveSlug;

/**
 * Resolves an `rz-target` value into its routing targets: DOM `swaps`
 * (selectors resolved to elements, each with its swap method) and `@store`
 * target names.
 *
 * Returns an object with two arrays: one containing swap operations and a
 * separate one for store targets. Multi-target updates are supported, including
 * combining DOM and store targets. HTML responses ignore store targets, and JSON
 * responses ignore DOM targets.
 *
 * An empty value defaults to one swap targeting `hostEl`.
 *
 * - `rz-target="afterbegin: #output"`
 * - `rz-target="#output"`
 * - `rz-target="outerHTML"`
 * - `rz-target="@store"`
 * - `rz-target="@status, beforeend: #status"`
 */
export function resolveRouteTargets(
  value: string | null | undefined,
  hostEl: Element,
  appRoot: Element,
): TargetConfig {
  const swaps: SwapOperation[] = [];
  const stores: string[] = [];
  const parsed = value?.trim() ? parseDirectiveValue(value) : [];

  if (parsed.length === 0) {
    swaps.push({ targets: [hostEl], method: DEFAULT_SWAP_METHOD });
    return { swaps, stores };
  }

  for (const [key, val] of parsed) {
    // Store target: collect the name for the JSON store router, not a DOM swap.
    const store = key.startsWith(STORE_PREFIX)
      ? key
      : val?.startsWith(STORE_PREFIX)
        ? val
        : '';

    // @store target
    if (store) {
      stores.push(store.slice(1));
    }

    // "Method: Selector"
    else if (val) {
      swaps.push({
        method: isSwapMethod(key) ? key : DEFAULT_SWAP_METHOD,
        targets: queryEls(appRoot, val),
      });
    }

    // "Method" alone (uses host element)
    else if (isSwapMethod(key)) {
      swaps.push({ targets: [hostEl], method: key });
    }

    // "Selector" alone (uses default method)
    else {
      swaps.push({ targets: queryEls(appRoot, key), method: DEFAULT_SWAP_METHOD });
    }
  }

  return { swaps, stores };
}

function queryEls(appRoot: Element, selector: string): Element[] {
  const targets = queryTargets(appRoot, selector);
  __DEV__ && targets.length === 0 && warn(`No targets found for '${selector}'.`);

  return targets;
}

/**
 * Resolves an element's `rz-target` into its routing destinations (DOM swaps and
 * `@store` names). An `overrideValue` (e.g. a server `Rouse-Target` header) takes
 * precedence over the element's attribute.
 */
function getConfig(el: Element, appRoot: Element, overrideValue?: string | null) {
  const value = overrideValue || getDirectiveValue(el, SLUG);
  return resolveRouteTargets(value, el, appRoot);
}

export const rzTarget = {
  slug: SLUG,
  getConfig,
} as const satisfies ConfigDirective<TargetConfig>;
