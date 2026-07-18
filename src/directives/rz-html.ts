import { effect } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { updateHtml } from '../dom/updater';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';

const SLUG = 'html' as const satisfies DirectiveSlug;

function bind(el: Element, scope: Scope, app: RouseApp, raw: string): BoundCleanupFn {
  return effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);
    updateHtml(el, val);
  }) as BoundCleanupFn;
}

export const rzHtml = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
