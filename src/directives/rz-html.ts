import { getApp } from '../core/app';
import { resolveState } from '../core/path';
import { updateHtml } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  CleanupFunction,
  DirectiveSchema,
  RouseController,
} from '../types';

export const rzHtml = {
  slug: 'html',
  handler: attachHtml,
} as const satisfies DirectiveSchema;

export function attachHtml(
  el: HTMLElement,
  scope: RouseController,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, getApp(el)?.stores);
    updateHtml(el, val);
  });

  return cleanup(stopEffect);
}
