import { updateAttr, updateClass, updateStyle } from '../dom/updater';
import { getNestedVal } from '../dom/utils';
import { effect } from '../reactivity';
import type { RouseController } from '../types';

export function applyBind(
  el: HTMLElement,
  instance: RouseController,
  type: string,
  path: string,
): () => void {
  return effect(() => {
    const val = getNestedVal(instance, path);

    if (type === 'class') {
      updateClass(el, val);
    } else if (type === 'style') {
      updateStyle(el, val);
    } else {
      updateAttr(el, type, val);
    }
  });
}
