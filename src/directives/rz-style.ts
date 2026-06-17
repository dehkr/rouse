import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/props';
import { applyStyles, setStyleProperty, updateStyle } from '../dom/updater';
import { boundCleanup } from '../dom/utils';
import { effect } from '../reactivity';
import type { BoundCleanupFn, BoundDirective, Controller, DirectiveSlug } from '../types';

const SLUG = 'style' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Controller,
  app: RouseApp,
  key: string,
  val: string,
): BoundCleanupFn {
  const run = () => {
    const lookup = val === '' ? key : val;
    const resolved = resolveBoundValue(lookup, scope, app.stores, el, SLUG);

    if (val === '') {
      updateStyle(el, resolved);
    } else if (key.includes(':')) {
      applyStyles(el, key, !!resolved);
    } else {
      setStyleProperty(el, key, resolved);
    }
  };

  return boundCleanup(effect(run));
}

export const rzStyle = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
