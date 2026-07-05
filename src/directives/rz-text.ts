import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { updateText } from '../dom/updater';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';

const SLUG = 'text' as const satisfies DirectiveSlug;

function bind(el: Element, scope: Scope, app: RouseApp, raw: string): BoundCleanupFn {
  return effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateText(el, val);
  }) as BoundCleanupFn;
}

export const rzText = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
