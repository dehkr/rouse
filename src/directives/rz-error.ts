import type { SwapOperation } from '../core/constants';
import { getDirectiveValue, resolveSwapOperations } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

const SLUG = 'error' as const satisfies DirectiveSlug;

export const rzError = {
  slug: SLUG,
  getConfig: (el: Element, appRoot: Element, overrideValue?: string | null) => {
    const value = overrideValue || getDirectiveValue(el, SLUG);
    // Errors must have an explicit target to mutate the DOM, so we return `[]` here
    // to avoid the default swap behavior of `resolveSwapOperations`.
    if (!value?.trim()) return [];
    return resolveSwapOperations(value, el, appRoot);
  },
} as const satisfies ConfigDirective<SwapOperation[]>;
