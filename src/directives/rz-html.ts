import { updateHtml } from '../dom/updater';
import { getNestedVal } from '../dom/utils';
import { effect } from '../reactivity';
import type { RouseController } from '../types';

export const SLUG = 'html' as const;

export function applyHtml(
  el: HTMLElement,
  instance: RouseController,
  prop: string,
): () => void {
  return effect(() => {
    const val = getNestedVal(instance, prop);
    updateHtml(el, val);
  });
}
