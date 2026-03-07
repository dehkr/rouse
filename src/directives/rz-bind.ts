import { getApp } from '../core/app';
import { resolveState } from '../core/path';
import { updateAttr, updateClass, updateStyle } from '../dom/updater';
import { effect } from '../reactivity';
import type { BindableValue, RouseController } from '../types';

export const SLUG = 'bind' as const;

export function applyBind(
  el: HTMLElement,
  instance: RouseController,
  type: string,
  path: string,
): () => void {
  return effect(() => {
    const val = resolveState<BindableValue>(path, instance, getApp(el)?.stores);

    if (type === 'class') {
      updateClass(el, val);
    } else if (type === 'style') {
      updateStyle(el, val);
    } else {
      updateAttr(el, type, val);
    }
  });
}
