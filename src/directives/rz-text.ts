import { effect } from '../reactivity';
import { getNestedVal } from '../dom/utils';
import { updateText } from '../dom/updater';
import type { RouseController } from '../types';

export function applyText(
  el: HTMLElement,
  instance: RouseController,
  prop: string,
): () => void {
  const stop = effect(() => {
    const val = getNestedVal(instance, prop);
    updateText(el, val);
  });

  return stop;
}
