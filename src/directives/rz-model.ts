import { effect } from '../reactivity';
import { getNestedVal, isInput, isSelect, setNestedVal } from '../dom/utils';
import { updateValue, getValue } from '../dom/updater';
import type { RouseController } from '../types';

export function applyModel(el: HTMLElement, instance: RouseController, prop: string) {
  // State -> DOM
  const stopEffect = effect(() => {
    const val = getNestedVal(instance, prop);
    updateValue(el, val);
  });

  // Determine best event type
  const isBinary = isInput(el) && (el.type === 'checkbox' || el.type === 'radio');
  const eventType = isSelect(el) || isBinary ? 'change' : 'input';

  // DOM -> State
  const handler = () => {
    const newVal = getValue(el);
    setNestedVal(instance, prop, newVal);
  };

  el.addEventListener(eventType, handler);

  // Return cleanup
  return () => {
    stopEffect();
    el.removeEventListener(eventType, handler);
  }
}
