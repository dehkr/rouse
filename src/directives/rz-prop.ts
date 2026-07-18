import { effect } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { updateProp } from '../dom/updater';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';

const SLUG = 'prop' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  raw: string,
): BoundCleanupFn {
  return effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateProp(el, key, val);
  }) as BoundCleanupFn;
}

export const rzProp = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
