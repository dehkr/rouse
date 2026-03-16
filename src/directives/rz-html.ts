import { getApp } from '../core/app';
import { resolveState } from '../core/path';
import { updateHtml } from '../dom/updater';
import { effect } from '../reactivity';
import type { BindableValue, RouseController } from '../types';

export const SLUG = 'html' as const;

export function attachHtml(
  el: HTMLElement,
  instance: RouseController,
  path: string,
): () => void {
  return effect(() => {
    const val = resolveState<BindableValue>(path, instance, getApp(el)?.stores);
    updateHtml(el, val);
  });
}
