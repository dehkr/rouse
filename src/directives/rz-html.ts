import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { updateHtml } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';

const SLUG = 'html' as const satisfies DirectiveSlug;

function bind(el: Element, scope: Scope, app: RouseApp, raw: string): BoundCleanupFn {
  const stopEffect = effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateHtml(el, val);
  });

  return boundCleanup(stopEffect);
}

export const rzHtml = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
