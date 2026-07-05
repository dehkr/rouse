import type { TargetConfig } from '../core/constants';
import { getDirectiveValue, resolveRouteTargets } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'target' as const satisfies DirectiveSlug;

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
