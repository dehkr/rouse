import { getDirectiveValue, hasDirective, parseMethodAndUrl } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'source' as const satisfies DirectiveSlug;

export const rzSource = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<{ method?: string; url?: string }>;

// =======================================================================================

const SAVE_METHODS = ['POST', 'PUT', 'PATCH'] as const;

/**
 * Parses the rz-source attribute into a URL and method.
 * Supports the [method]: [url] format.
 *
 * - `rz-source="PUT: /api/users"`
 * - `rz-source="/api/users"`
 */
function getConfig(el: Element) {
  return parseMethodAndUrl(getDirectiveValue(el, SLUG), {
    allowedMethods: SAVE_METHODS,
    defaultMethod: 'POST',
    label: 'save method',
  });
}
