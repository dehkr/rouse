import { getDirectiveValue, hasDirective, parseMethodAndUrl } from '../core/shared';
import type { Directive, DirectiveSlug } from '../types';

const SLUG = 'source' as const satisfies DirectiveSlug;

export const rzSource = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getMethodAndUrl,
} as const satisfies Directive;

const SAVE_METHODS = ['POST', 'PUT', 'PATCH'] as const;

/**
 * Parses the rz-source attribute into a URL and method.
 * Supports the [method]: [url] format.
 *
 * - `rz-source="PUT: /api/users"`
 * - `rz-source="/api/users"`
 */
function getMethodAndUrl(el: Element) {
  return parseMethodAndUrl(getDirectiveValue(el, SLUG), {
    allowedMethods: SAVE_METHODS,
    defaultMethod: 'POST',
    label: 'save method',
  });
}
