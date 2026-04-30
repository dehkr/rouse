import { getDirectiveValue, hasDirective, resolveInsertOperations } from '../core/shared';
import type { ConfigDirective, DirectiveSlug, InsertOperation } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'target' as const satisfies DirectiveSlug;

export const rzTarget = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig: (el: Element, appRoot: Element, overrideValue?: string | null) => {
    const value = overrideValue || getDirectiveValue(el, SLUG);
    return resolveInsertOperations(value, el, appRoot);
  },
} as const satisfies ConfigDirective<InsertOperation[]>;

// =======================================================================================
