import type { RouseApp } from '../core/app';
import type { PatchAction } from '../core/constants';
import { parseStoreSubject, parseTriggerSubjectPairs } from '../core/parser';
import { getDirectiveValue, warn } from '../core/shared';
import { resolveTarget } from '../core/store';
import { dispatchTrigger } from '../dom/scheduler';
import { resolveRequestConfig } from '../net/request';
import type { DirectiveSlug, StandaloneDirective, VoidFn } from '../types';

const SLUG = 'pull' as const satisfies DirectiveSlug;
const cleanups = new WeakMap<Element, Array<VoidFn>>();

/**
 * Resolves the merged request config from the trigger and target elements
 * and dispatches the pull through the store manager. Bails when the
 * target store isn't registered or already has a request in flight.
 */
function triggerPull(
  triggerEl: Element,
  app: RouseApp,
  storeName: string,
  nestedPath?: string,
  action?: PatchAction,
) {
  const status = app.stores.status(storeName);
  if (!status) {
    warn(`Cannot pull: store '${storeName}' not found.`);
    return;
  }
  if (status.loading) return;

  const targetEl = app.stores.elementFor(storeName);
  const overrides = resolveRequestConfig(triggerEl, 'pull', app, targetEl);

  app.stores.pull(storeName, { overrides, nestedPath, action });
}

/**
 * Manager entry for `rz-pull`. Parses each `[trigger]: [[action] @store[.path]]`
 * pair from the attribute value and wires the trigger to fire a pull
 * against the resolved target.
 */
function initialize(el: Element, app: RouseApp) {
  if (cleanups.has(el)) return;

  const value = getDirectiveValue(el, SLUG);
  if (value === null) return;

  const pairs = parseTriggerSubjectPairs(value);
  if (pairs.length === 0) {
    warn('A valid trigger is missing for rz-pull:', el);
    return;
  }

  const teardowns: VoidFn[] = [];

  for (const { trigger, subject } of pairs) {
    const parsed = subject ? parseStoreSubject(subject, el) : {};
    if (!parsed) continue;

    const { action, target } = parsed;
    const resolved = resolveTarget(el, 'pull', target ?? null, true);
    if (!resolved) continue;

    const { storeName, nestedPath } = resolved;
    const fire = () => triggerPull(el, app, storeName, nestedPath, action);
    const cleanup = dispatchTrigger(trigger, { el, app, action: fire });
    if (cleanup) {
      teardowns.push(cleanup);
    }
  }

  if (teardowns.length > 0) {
    cleanups.set(el, teardowns);
  }
}

function teardown(el: Element) {
  cleanups.get(el)?.forEach((fn) => fn());
  cleanups.delete(el);
}

/**
 * Definition for the `rz-pull` directive object. Wires events to pull
 * server state into a local store.
 */
export const rzPull = {
  slug: SLUG,
  initialize,
  teardown,
} as const satisfies StandaloneDirective;
