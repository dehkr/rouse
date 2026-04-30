import { splitInjection } from '../core/props';
import { getDirectiveValue, hasDirective } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'scope' as const satisfies DirectiveSlug;

export const rzScope = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<{
  controllerName: string;
  rawPayload: string | undefined;
} | null>;

// =======================================================================================

function getConfig(
  el: Element,
): { controllerName: string; rawPayload: string | undefined } | null {
  const value = getDirectiveValue(el, SLUG);
  if (value === null) return null;

  const { key: controllerName, rawPayload } = splitInjection(value);

  return { controllerName, rawPayload };
}
