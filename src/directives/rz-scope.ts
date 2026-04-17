import { splitInjection } from '../core/props';
import { getDirectiveValue, hasDirective } from '../core/shared';
import type { Directive } from '../types';

export const rzScope = {
  existsOn: (el: Element) => hasDirective(el, 'scope'),
  getValue: (el: Element) => getDirectiveValue(el, 'scope'),
  getControllerAndPayload,
} as const satisfies Directive;

function getControllerAndPayload(
  el: Element,
): { controllerName: string; rawPayload: string | undefined } | null {
  const value = getDirectiveValue(el, 'scope');
  if (value === null) return null;

  const { key: controllerName, rawPayload } = splitInjection(value);

  return { controllerName, rawPayload };
}
