import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/props';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { updateHtml } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, Controller, DirectiveSlug } from '../types';

const SLUG = 'html' as const satisfies DirectiveSlug;

function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  raw: string,
): BoundCleanupFn {
  const stopEffect = effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateHtml(el, val);
  });

  return boundCleanup(stopEffect);
}

export const rzHtml = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attach,
} as const satisfies BoundDirective;
