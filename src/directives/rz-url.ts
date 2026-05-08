import { getDirectiveValue, hasDirective } from '../core/shared';
import { is } from '../dom/utils';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'url' as const satisfies DirectiveSlug;

/**
 * URL source of truth for an element. Falls back to `href` (anchors)
 * or `action` (forms) when the attribute is empty.
 */
function getConfig(el: Element): { url: string } {
  const value = getDirectiveValue(el, SLUG)?.trim();
  if (value) return { url: value };

  if (is(el, 'Anchor')) return { url: el.href };
  if (is(el, 'Form')) return { url: el.action };

  return { url: '' };
}

export const rzUrl = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<{ url: string }>;
