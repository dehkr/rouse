import type { SwapOperation } from '../core/constants';
import { getDirectiveValue, resolveSwapOperations } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'target' as const satisfies DirectiveSlug;

export const rzTarget = {
  slug: SLUG,
  getConfig: (el: Element, appRoot: Element, overrideValue?: string | null) => {
    const value = overrideValue || getDirectiveValue(el, SLUG);
    return resolveSwapOperations(value, el, appRoot);
  },
} as const satisfies ConfigDirective<SwapOperation[]>;
