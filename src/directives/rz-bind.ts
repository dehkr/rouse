import type { RouseApp } from '../core/app';
import { resolveState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateAttr, updateClass, updateStyle } from '../dom/updater';
import { cleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  BoundDirective,
  CleanupFunction,
  Controller,
  DirectiveSlug,
} from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'bind' as const satisfies DirectiveSlug;

export const rzBind = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attach,
} as const satisfies BoundDirective;

// =======================================================================================

function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  type: string,
  path: string,
): CleanupFunction {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, app.stores);

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
