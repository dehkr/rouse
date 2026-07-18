import { effect } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { updateClass } from '../dom/updater';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';

const SLUG = 'class' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  val: string,
): BoundCleanupFn {
  return effect(() => {
    const resolvedValue = resolveBoundValue(val || key, scope, app.stores, el, SLUG);
    updateClass(el, val === '' ? resolvedValue : { [key]: !!resolvedValue });
  }) as BoundCleanupFn;
}

export const rzClass = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
