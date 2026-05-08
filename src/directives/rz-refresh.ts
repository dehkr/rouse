import type { RouseApp } from '../core/app';
import { parseTriggerSubjectPairs } from '../core/parser';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import { resolveTarget } from '../core/store';
import { dispatchTrigger } from '../dom/scheduler';
import { resolveRequestConfig } from '../net/request';
import type { DirectiveSlug, ManagerDirective, VoidFn } from '../types';

const SLUG = 'refresh' as const satisfies DirectiveSlug;
const cleanups = new WeakMap<Element, Array<VoidFn>>();

/**
 * Resolves the merged request config from the trigger and target elements
 * and dispatches the refresh through the store manager. Bails when the
 * target store isn't registered or already has a request in flight.
 */
function triggerRefresh(triggeringEl: Element, app: RouseApp, storeName: string) {
  const status = app.stores.status(storeName);
  if (!status) {
    warn(`Cannot refresh: store '${storeName}' not found.`);
    return;
  }
  if (status.loading) return;

  const targetEl = app.stores.elementFor(storeName);
  const overrides = resolveRequestConfig(triggeringEl, 'refresh', app, targetEl);

  app.stores.refresh(storeName, { overrides });
}

/**
 * Manager entry for `rz-refresh`. Parses each `[trigger]: [@store]` pair
 * from the attribute value and wires the trigger to fire a refresh against
 * the resolved target.
 */
function initialize(el: Element, app: RouseApp) {
  if (cleanups.has(el)) return;

  const value = getDirectiveValue(el, SLUG);
  if (value === null) return;

  const pairs = parseTriggerSubjectPairs(value);
  if (pairs.length === 0) return;

  const teardowns: VoidFn[] = [];

  for (const { trigger, subject } of pairs) {
    const target = resolveTarget(el, 'refresh', subject, false);
    if (!target) continue;

    const { storeName } = target;
    const fire = () => triggerRefresh(el, app, storeName);
    const cleanup = dispatchTrigger(trigger, { el, app, action: fire });

    if (cleanup) teardowns.push(cleanup);
  }

  if (teardowns.length > 0) cleanups.set(el, teardowns);
}

/**
 * Cleanup
 */
function teardown(el: Element) {
  cleanups.get(el)?.forEach((fn) => fn());
  cleanups.delete(el);
}

/**
 * Definition for the `rz-refresh` directive object. Wires events to pull
 * server state into a local store.
 *
 * Each segment is `[trigger]: [@store]`. When the subject is omitted, the
 * directive targets the `rz-store` on the same element. Nested paths are
 * not supported (refresh always pulls the whole store).
 */
export const rzRefresh = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  initialize,
  teardown,
} as const satisfies ManagerDirective;
