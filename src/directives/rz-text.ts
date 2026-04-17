import type { RouseApp } from '../core/app';
import { resolveState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateText } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  BoundDirective,
  CleanupFunction,
  Controller,
} from '../types';

export const rzText = {
  existsOn: (el: Element) => hasDirective(el, 'text'),
  getValue: (el: Element) => getDirectiveValue(el, 'text'),
  attach,
} as const satisfies BoundDirective;

function attach(
  el: Element,
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
