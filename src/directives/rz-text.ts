import { updateText } from '../dom/updater';
import { getNestedVal } from '../dom/utils';
import { effect } from '../reactivity';
import type { RouseController } from '../types';

export const TEXT_SLUG = 'text' as const;

export function applyText(
  el: HTMLElement,
  instance: RouseController,
  prop: string,
): () => void {
  return effect(() => {
    const val = getNestedVal(instance, prop);
    updateText(el, val);
  });
}
