import type { RouseApp } from '../core/app';
import { resolveState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateText } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BindableValue, BoundDirective, CleanupFunction, Controller } from '../types';

export const rzText = {
  existsOn,
  getRawValue,
  attach,
} as const satisfies BoundDirective;

function existsOn(el: Element) {
  return hasDirective(el, 'text');
}

function getRawValue(el: Element) {
  return getDirectiveValue(el, 'text');
}

function attach(
  el: HTMLElement,
  scope: Controller,
  app: RouseApp,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, app.stores);
    updateText(el, val);
  });

  return cleanup(stopEffect);
}
