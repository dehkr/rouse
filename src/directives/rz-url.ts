import type { HttpMethod } from '../core/constants';
import { parseUrlSubject } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { is } from '../dom/utils';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'url' as const satisfies DirectiveSlug;

/**
 * URL source of truth for an element. Falls back to `href` (anchors)
 * or `action` (forms) when the attribute is empty.
 */
function getConfig(el: Element): { method?: HttpMethod; url: string } {
  const value = getDirectiveValue(el, SLUG)?.trim();

  if (value) {
    const { method, url } = parseUrlSubject(value);
    if (url) return { method, url };
  }

  if (is(el, 'Anchor')) {
    return { url: el.getAttribute('href') ?? el.href };
  }

  if (is(el, 'Form')) {
    return { url: el.getAttribute('action') ?? el.action };
  }

  return { url: '' };
}

export const rzUrl = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<{ method?: HttpMethod; url: string }>;
