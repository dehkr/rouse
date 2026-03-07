import { getApp } from '../core/app';
import { resolveState, writeState } from '../core/path';
import { getValue, updateValue } from '../dom/updater';
import { isInput, isSelect } from '../dom/utils';
import { effect } from '../reactivity';
import type { BindableValue, RouseController } from '../types';

export const SLUG = 'model' as const;

export function applyModel(el: HTMLElement, instance: RouseController, prop: string) {
  const app = getApp(el);

  // State -> DOM
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(prop, instance, app?.stores);
    updateValue(el, val);
  });

  // Determine best event type
  const isBinary = isInput(el) && (el.type === 'checkbox' || el.type === 'radio');
  const eventType = isSelect(el) || isBinary ? 'change' : 'input';

  // State <- DOM
  const handler = () => {
    const newVal = getValue(el);
    writeState(prop, newVal, instance, app?.stores);
  };

  el.addEventListener(eventType, handler);

  // Return cleanup
  return () => {
    stopEffect();
    el.removeEventListener(eventType, handler);
  };
}
