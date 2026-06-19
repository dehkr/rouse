import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { updateProp } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';

const SLUG = 'prop' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  raw: string,
): BoundCleanupFn {
  const stopEffect = effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateProp(el, key, val);
  });

  return boundCleanup(stopEffect);
}

export const rzProp = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
