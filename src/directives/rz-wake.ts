import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'wake' as const satisfies DirectiveSlug;

export const rzWake = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<[string, string][]>;

// =======================================================================================

function getConfig(el: Element, defaultStrategy?: string): [string, string][] {
  return parseDirectiveValue(
    getDirectiveValue(el, SLUG)?.trim() || defaultStrategy || '',
  );
}
