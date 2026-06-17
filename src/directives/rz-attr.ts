import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/props';
import { updateAttr, updateClass, updateStyle } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, Controller, DirectiveSlug } from '../types';

const SLUG = 'attr' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Controller,
  app: RouseApp,
  type: string,
  raw: string,
): BoundCleanupFn {
  const stopEffect = effect(() => {
    const val = resolveBoundValue(raw, scope, app.stores, el, SLUG);

    if (type === 'class') {
      updateClass(el, val);
    } else if (type === 'style') {
      updateStyle(el, val);
    } else {
      updateAttr(el, type, val);
    }
  });

  return boundCleanup(stopEffect);
}

export const rzAttr = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
