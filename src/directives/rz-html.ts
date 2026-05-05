import type { RouseApp } from '../core/app';
import { resolveState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateHtml } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  BoundCleanupFn,
  BoundDirective,
  Controller,
  DirectiveSlug,
} from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'html' as const satisfies DirectiveSlug;

export const rzHtml = {
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
  path: string,
): BoundCleanupFn {
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(path, scope, app.stores);
    updateHtml(el, val);
  });

  return boundCleanup(stopEffect);
}
