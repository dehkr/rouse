import type { InsertOperation } from '../core/constants';
import { getDirectiveValue, resolveInsertOperations } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'target' as const satisfies DirectiveSlug;

export const rzTarget = {
  slug: SLUG,
  getConfig: (el: Element, appRoot: Element, overrideValue?: string | null) => {
    const value = overrideValue || getDirectiveValue(el, SLUG);
    return resolveInsertOperations(value, el, appRoot);
  },
} as const satisfies ConfigDirective<InsertOperation[]>;
