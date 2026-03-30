import { getApp } from '../core/app';
import { resolveState } from '../core/path';
import { updateText } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  CleanupFunction,
  DirectiveSchema,
  RouseController,
} from '../types';

export const rzText = {
  slug: 'text',
  handler: attachText,
} as const satisfies DirectiveSchema;

export function attachText(
  el: HTMLElement,
  scope: RouseController,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, getApp(el)?.stores);
    updateText(el, val);
  });

  return cleanup(stopEffect);
}
