import type { RouseApp } from '../core/app';
import type { PatchAction } from '../core/constants';
import { parseStoreSubject, parseTriggerSubjectPairs } from '../core/parser';
import { getRootSegment } from '../core/path';
import { getDirectiveValue, warn } from '../core/shared';
import { resolveTarget } from '../core/store';
import { applyTiming } from '../core/timing';
import { dispatchTrigger } from '../dom/scheduler';
import { resolveRequestConfig } from '../net/request';
import type { DirectiveSlug, StandaloneDirective, TriggerDef, VoidFn } from '../types';

const SLUG = 'push' as const satisfies DirectiveSlug;
const elementCleanups = new WeakMap<Element, Array<VoidFn>>();

/**
 * Resolves the merged request config from the trigger and target elements
 * and dispatches the push through the store manager.
 */
function triggerPush(
  triggerEl: Element,
  app: RouseApp,
  storeName: string,
  nestedPath: string,
  action?: PatchAction,
) {
  const status = app.stores.status(storeName);
  if (!status) {
    __DEV__ && warn(`rz-push: store '@${storeName}' not found.`, triggerEl);
    return;
  }
  if (status.loading) return;

  const targetEl = app.stores.elementFor(storeName);
  const overrides = resolveRequestConfig(triggerEl, 'push', app, targetEl);

  app.stores.push(storeName, { overrides, nestedPath, action });
}

/**
 * Parses each `[trigger]: [[action] @store[.path]]` pair from the attribute
 * value and wires the trigger to fire a push against the resolved target.
 */
function initialize(el: Element, app: RouseApp) {
  if (elementCleanups.has(el)) return;

  const value = getDirectiveValue(el, SLUG);
  if (value === null) return;

  const pairs = parseTriggerSubjectPairs(value);
  if (pairs.length === 0) {
    __DEV__ &&
      warn(
        'rz-push: at least one trigger is required (e.g., rz-push="click: @user").',
        el,
      );
    return;
  }

  const cleanups: VoidFn[] = [];

  for (const { trigger, subject } of pairs) {
    const parsed = subject ? parseStoreSubject(subject, el) : {};
    if (!parsed) continue;

    const { action, target } = parsed;
    const resolved = resolveTarget(el, 'push', target ?? null);
    if (!resolved) continue;

    const { storeName, nestedPath } = resolved;
    const fire = () => triggerPush(el, app, storeName, nestedPath, action);

    if (trigger.event === 'edit') {
      cleanups.push(
        attachMutateEffect(app, storeName, trigger.modifiers, fire, nestedPath),
      );
      continue;
    }

    const cleanup = dispatchTrigger(trigger, { el, app, action: fire });
    if (cleanup) {
      cleanups.push(cleanup);
    }
  }

  if (cleanups.length > 0) {
    elementCleanups.set(el, cleanups);
  }
}

function teardown(el: Element) {
  elementCleanups.get(el)?.forEach((fn) => fn());
  elementCleanups.delete(el);
}

/**
 * Fires `triggerPush` whenever the store data changes.
 */
function attachMutateEffect(
  app: RouseApp,
  storeName: string,
  modifiers: TriggerDef['modifiers'],
  fire: VoidFn,
  nestedPath: string,
): VoidFn {
  const rootKey = nestedPath ? getRootSegment(nestedPath) : null;

  const guardedFire = () => {
    const status = app.stores.status(storeName);
    if (!status) return;
    const hasDirty = rootKey
      ? !!status.dirty[rootKey]
      : Object.keys(status.dirty).length > 0;
    if (!hasDirty) return; // nothing to push
    fire();
  };

  const debouncedFire = applyTiming(guardedFire, modifiers);
  const stopListener = app.stores.onEdit(storeName, debouncedFire);

  return () => {
    debouncedFire.cancel();
    stopListener();
  };
}

/**
 * Wires events to push local store state to the server.
 */
export const rzPush = {
  slug: SLUG,
  initialize,
  teardown,
} as const satisfies StandaloneDirective;
