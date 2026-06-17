import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/props';
import { updateClass } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, Controller, DirectiveSlug } from '../types';

const SLUG = 'class' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Controller,
  app: RouseApp,
  key: string,
  val: string,
): BoundCleanupFn {
  const run = () => {
    const resolvedValue = resolveBoundValue(val || key, scope, app.stores, el, SLUG);
    updateClass(el, val === '' ? resolvedValue : { [key]: !!resolvedValue });
  };

  return boundCleanup(effect(run));
}

export const rzClass = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
