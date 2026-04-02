import { getDirectiveValue } from '../core/shared';
import { splitInjection } from '../dom/utils';
import type { DirectiveSchema } from '../types';

export const rzScope = {
  slug: 'scope',
  handler: getControllerName,
} as const satisfies DirectiveSchema;

export function getControllerName(el: HTMLElement): string | null {
  const rawValue = getDirectiveValue(el, 'scope');
  return rawValue ? splitInjection(rawValue).key : null;
}
