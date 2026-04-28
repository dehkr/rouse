import {
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
  resolveInsertOperations,
} from '../core/shared';
import type { Directive, DirectiveSlug } from '../types';

const SLUG = 'target' as const satisfies DirectiveSlug;

export const rzTarget = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getDefinedValue: (el: Element) => getDefinedDirectiveValue(el, SLUG),
  getInsertConfig: (el: Element, appRoot: Element, overrideValue?: string | null) => {
    const value = overrideValue || getDefinedDirectiveValue(el, SLUG);
    return resolveInsertOperations(value, el, appRoot);
  },
} as const satisfies Directive;
