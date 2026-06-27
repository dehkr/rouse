import { getDirectiveValue } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'url' as const satisfies DirectiveSlug;

/**
 * The request URL for an element. Read by `rz-fetch` (and by `rz-store` for a
 * store's sync URL). The attribute value is passed through without validation,
 * leaving the browser to resolve it as a relative or absolute URL.
 *
 * @example
 * <button rz-url="/api/users" rz-fetch="click: POST">Save</button>
 */
function getConfig(el: Element): { url: string } {
  return { url: getDirectiveValue(el, SLUG)?.trim() ?? '' };
}

export const rzUrl = {
  slug: SLUG,
  getConfig,
} as const satisfies ConfigDirective<{ url: string }>;
