import { splitInjection } from '../core/props';
import { getDirectiveValue, hasDirective } from '../core/shared';
import type { Directive } from '../types';

export const rzScope = {
  existsOn,
  getValue,
  getControllerAndPayload,
} as const satisfies Directive;

function existsOn(el: Element) {
  return hasDirective(el, 'scope');
}

function getValue(el: Element) {
  return getDirectiveValue(el, 'scope');
}

function getControllerAndPayload(
  el: Element,
): { controllerName: string; rawPayload: string | undefined } | null {
  const value = getValue(el);
  if (value === null) return null;

  const { key: controllerName, rawPayload } = splitInjection(value);

  return { controllerName, rawPayload };
}
