import type { RouseApp } from '../core/app';
import { resolveState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateHtml } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  BoundDirective,
  CleanupFunction,
  Controller,
} from '../types';

export const rzHtml = {
  existsOn,
  getValue,
  attach,
} as const satisfies BoundDirective;

function existsOn(el: Element) {
  return hasDirective(el, 'html');
}

function getValue(el: Element) {
  return getDirectiveValue(el, 'html');
}

function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, app.stores);
    updateHtml(el, val);
  });

  return cleanup(stopEffect);
}
