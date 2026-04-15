import type { RouseApp } from '../core/app';
import { resolveState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateAttr, updateClass, updateStyle } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BindableValue, BoundDirective, CleanupFunction, Controller } from '../types';

export const rzBind = {
  existsOn,
  getRawValue,
  attach,
} as const satisfies BoundDirective;

function existsOn(el: Element) {
  return hasDirective(el, 'bind');
}

function getRawValue(el: Element) {
  return getDirectiveValue(el, 'bind');
}

function attach(
  el: HTMLElement,
  scope: Controller,
  app: RouseApp,
  type: string,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, app.stores);

    if (type === 'class') {
      updateClass(el, val);
    } else if (type === 'style') {
      updateStyle(el, val);
    } else {
      updateAttr(el, type, val);
    }
  });

  return cleanup(stopEffect);
}
