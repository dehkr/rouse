import type { RouseApp } from '../core/app';
import { resolveState, writeState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { getValue, updateValue } from '../dom/updater';
import { cleanup, isInput, isSelect } from '../dom/utils';
import { effect } from '../reactivity';
import type { BindableValue, BoundDirective, CleanupFunction, Controller } from '../types';

export const rzModel = {
  existsOn,
  getRawValue,
  attach,
} as const satisfies BoundDirective;

function existsOn(el: Element) {
  return hasDirective(el, 'model');
}

function getRawValue(el: Element) {
  return getDirectiveValue(el, 'model');
}

/**
 * Two-way binding for form elements
 */
function attach(
  el: HTMLElement,
  scope: Controller,
  app: RouseApp,
  prop: string,
): CleanupFunction {
  // State -> DOM
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(prop, scope, app.stores);
    updateValue(el, val);
  });

  // Determine best event type
  const isBinary = isInput(el) && (el.type === 'checkbox' || el.type === 'radio');
  const eventType = isSelect(el) || isBinary ? 'change' : 'input';

  // State <- DOM
  const handler = () => {
    const newVal = getValue(el);
    writeState(prop, newVal, scope, app.stores);
  };

  el.addEventListener(eventType, handler);

  return cleanup(() => {
    stopEffect();
    el.removeEventListener(eventType, handler);
  });
}
