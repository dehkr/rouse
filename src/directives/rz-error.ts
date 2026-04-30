import { getDirectiveValue, hasDirective, resolveInsertOperations } from '../core/shared';
import type { ConfigDirective, DirectiveSlug, InsertOperation } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'error' as const satisfies DirectiveSlug;

export const rzError = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig: (el: Element, appRoot: Element, overrideValue?: string | null) => {
    const value = overrideValue || getDirectiveValue(el, SLUG);
    // Errors must have an explicit target to mutate the DOM, so we return `[]` here
    // to avoid the default-insert behavior of `resolveInsertOperations`.
    if (!value?.trim()) return [];
    return resolveInsertOperations(value, el, appRoot);
  },
} as const satisfies ConfigDirective<InsertOperation[]>;

// =======================================================================================
