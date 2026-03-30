import { getApp } from '../core/app';
import { resolveState } from '../core/path';
import { updateAttr, updateClass, updateStyle } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  CleanupFunction,
  DirectiveSchema,
  RouseController,
} from '../types';

export const rzBind = {
  slug: 'bind',
  handler: attachBind,
} as const satisfies DirectiveSchema;

export function attachBind(
  el: HTMLElement,
  scope: RouseController,
  type: string,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, getApp(el)?.stores);

    if (type === 'class') {
      updateClass(el, val);
    } else if (type === 'style') {
      updateStyle(el, val);
    } else {
      updateAttr(el, type, val);
    }
  });

  return cleanup(stopEffect);
}
