import { getApp } from '../core/app';
import { resolveState, writeState } from '../core/path';
import { getValue, updateValue } from '../dom/updater';
import { cleanup, isInput, isSelect } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  CleanupFunction,
  DirectiveSchema,
  RouseController,
} from '../types';

export const rzModel = {
  slug: 'model',
  handler: attachModel,
} as const satisfies DirectiveSchema;

/**
 * Two-way binding for form elements
 */
export function attachModel(
  el: HTMLElement,
  scope: RouseController,
  prop: string,
): CleanupFunction {
  const app = getApp(el);

  // State -> DOM
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(prop, scope, app?.stores);
    updateValue(el, val);
  });

  // Determine best event type
  const isBinary = isInput(el) && (el.type === 'checkbox' || el.type === 'radio');
  const eventType = isSelect(el) || isBinary ? 'change' : 'input';

  // State <- DOM
  const handler = () => {
    const newVal = getValue(el);
    writeState(prop, newVal, scope, app?.stores);
  };

  el.addEventListener(eventType, handler);

  return cleanup(() => {
    stopEffect();
    el.removeEventListener(eventType, handler);
  });
}
