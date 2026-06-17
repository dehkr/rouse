import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/props';
import { updateText } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, Controller, DirectiveSlug } from '../types';

const SLUG = 'text' as const satisfies DirectiveSlug;

function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  raw: string,
): BoundCleanupFn {
  const stopEffect = effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateText(el, val);
  });

  return boundCleanup(stopEffect);
}

export const rzText = {
  slug: SLUG,
  attach,
} as const satisfies BoundDirective;
