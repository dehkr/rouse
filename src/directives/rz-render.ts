import type { RouseApp } from '../app';
import { warn } from '../core/diagnostics';
import { resolveBoundValue } from '../core/invoke';
import { renderTemplate } from '../dom/renderer';
import type { BoundCleanupFn, BoundDirective, Scope } from '../types';
import { getDirectiveValue } from '../core/elements';

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
    if (__DEV__) {
      warn(`rz-render: must be placed on a <template> element.`, el);
    }
    return;
  }

  const raw = value || key;
  const keyPath = readKey(el);

  return renderTemplate(
    el,
    () => resolveBoundValue(raw, scope, app.stores, el, 'render'),
    { app, parentState: scope, keyPath },
  ) as BoundCleanupFn;
}

export const rzRender = {
  slug: 'render',
  singleValue: true,
  bind,
} as const satisfies BoundDirective;

/**
 * Explicit reconciliation key for `rz-render`. Holds an item path resolved per
 * instance (e.g. `data-rz-key="id"` or `data-rz-key="user.id"`). Encouraged for any list
 * that reorders or is refetched, so instances reuse DOM by stable identity.
 * Without it, `rz-render` keys by position.
 *
 * @example
 * <template data-rz-render="@todos.items" data-rz-key="id">
 */
function readKey(el: Element): string | null {
  return getDirectiveValue(el, 'key')?.trim() || null;
}
