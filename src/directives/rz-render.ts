import type { RouseApp } from '../core/app';
import { resolveBoundValue } from '../core/injection';
import { warn } from '../core/shared';
import { renderTemplate } from '../dom/renderer';
import { boundCleanup } from '../dom/utils';
import type { BoundCleanupFn, BoundDirective, DirectiveSlug, Scope } from '../types';
import { rzKey } from './rz-key';

const SLUG = 'render' as const satisfies DirectiveSlug;

/**
 * Drives an `rz-render` template: resolves its value expression reactively and
 * hands a value getter to the render engine, which reconciles instances on every
 * change. Reads the optional `rz-key` companion for explicit reconciliation keys.
 */
function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  value: string,
): BoundCleanupFn | undefined {
  if (!(el instanceof HTMLTemplateElement)) {
    __DEV__ && warn(`rz-render: must be placed on a <template> element.`, el);
    return;
  }

  const raw = value || key;
  const keyPath = rzKey.getConfig(el);

  const dispose = renderTemplate(
    el,
    () => resolveBoundValue(raw, scope, app.stores, el, SLUG),
    { app, parentState: scope, keyPath },
  );

  return boundCleanup(dispose);
}

export const rzRender = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
