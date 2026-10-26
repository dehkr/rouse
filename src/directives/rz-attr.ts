import { effect } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { directiveSelector } from '../core/attributes';
import { warn } from '../core/diagnostics';
import { resolveBoundValue } from '../core/invoke';
import { updateAttr } from '../dom/updater';
import type { BoundCleanupFn, BoundDirective, Scope } from '../types';

function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  value: string,
): BoundCleanupFn | undefined {
  // Written as attributes, these would wipe the classes and styles the markup and
  // rz-class or rz-style set, so each has its own directive.
  const name = key.toLowerCase();
  if (name === 'class' || name === 'style') {
    __DEV__ && warn(`rz-attr: '${key}' belongs on data-rz-${name}. Ignoring.`, el);
    return undefined;
  }

  return effect(() => {
    updateAttr(el, key, resolveBoundValue(value || key, scope, app.stores, el, 'attr'));
  }) as BoundCleanupFn;
}

export const rzAttr = {
  slug: 'attr',
  selector: directiveSelector('attr'),
  bind,
} as const satisfies BoundDirective;
