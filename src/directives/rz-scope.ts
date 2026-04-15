import { getDirectiveValue, hasDirective } from '../core/shared';
import { splitInjection } from '../dom/utils';
import type { Directive } from '../types';

export const rzScope = {
  existsOn,
  getRawValue,
  getControllerAndPayload,
} as const satisfies Directive;

function existsOn(el: HTMLElement) {
  return hasDirective(el, 'scope');
}

function getRawValue(el: HTMLElement) {
  return getDirectiveValue(el, 'scope');
}

function getControllerAndPayload(
  el: HTMLElement,
): { controllerName: string; rawPayload: string | undefined } | null {
  const raw = getRawValue(el);
  if (raw === null) return null;

  const { key: controllerName, rawPayload } = splitInjection(raw);

  return { controllerName, rawPayload };
}
