import { getApp } from '../core/app';
import { resolveState } from '../core/path';
import { updateText } from '../dom/updater';
import { effect } from '../reactivity';
import type { BindableValue, RouseController } from '../types';

export const SLUG = 'text' as const;

export function attachText(
  el: HTMLElement,
  instance: RouseController,
  path: string,
): () => void {
  return effect(() => {
    const val = resolveState<BindableValue>(path, instance, getApp(el)?.stores);
    updateText(el, val);
  });
}
