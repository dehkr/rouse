import { getDirectiveValue } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'key' as const satisfies DirectiveSlug;

/**
 * Explicit reconciliation key for `rz-render`. Holds a `%`-path resolved per
 * item against the render item (e.g. `rz-key="%id"`). When absent, `rz-render`
 * falls back to an auto-generated identity key.
 *
 * @example
 * <template rz-render="@todos.items" rz-key="%id">
 */
function getConfig(el: Element): string | null {
  return getDirectiveValue(el, SLUG)?.trim() || null;
}

export const rzKey = {
  slug: SLUG,
  getConfig,
} as const satisfies ConfigDirective<string | null>;
