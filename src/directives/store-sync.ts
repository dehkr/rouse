import type { RouseApp } from '../core/app';
import type { PatchAction } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseStoreSubject } from '../core/parser';
import { getPathRoot } from '../core/path';
import { resolveTarget } from '../core/store';
import { applyTiming } from '../core/timing';
import { dispatchTrigger } from '../dom/events';
import { resolveRequestConfig } from '../net/request';
import type { TriggerDef, TriggerSubjectPair, VoidFn } from '../types';

/**
 * Binds each `[trigger]: [[action] @store[.path]]` pair to a push or pull.
 * The push `edit` trigger fires on store mutation via `bindStoreEditTrigger`;
 * every other trigger routes through `dispatchTrigger`. Returns the cleanups.
 */
export function bindStorePairs(
  op: 'push' | 'pull',
  el: Element,
  app: RouseApp,
  pairs: TriggerSubjectPair[],
) {
  const cleanups: VoidFn[] = [];

  for (const { trigger, subject } of pairs) {
    const parsed = subject ? parseStoreSubject(subject, el) : {};
    if (!parsed) continue;

    const { action, target } = parsed;
    const resolved = resolveTarget(el, op, target ?? null);
    if (!resolved) continue;

    const { storeName, nestedPath } = resolved;
    const fire = () => triggerStoreSync(op, el, app, storeName, nestedPath, action);

    if (op === 'push' && trigger.event === 'edit') {
      cleanups.push(
        bindStoreEditTrigger(app, storeName, trigger.modifiers, fire, nestedPath),
      );
      continue;
    }

    const cleanup = dispatchTrigger(trigger, { el, app, action: fire });
    if (cleanup) cleanups.push(cleanup);
  }

  return cleanups;
}

/**
 * Resolves the merged request config from the trigger and target elements and
 * dispatches a push or pull through the store manager. Bails when the target
 * store isn't registered or already has a request in flight.
 */
function triggerStoreSync(
  op: 'push' | 'pull',
  triggerEl: Element,
  app: RouseApp,
  storeName: string,
  nestedPath?: string,
  action?: PatchAction,
) {
  const status = app.stores.status(storeName);
  if (!status) {
    __DEV__ && warn(`rz-${op}: store '@${storeName}' not found.`, triggerEl);
    return;
  }
  if (status.loading) return;

  const targetEl = app.stores.elementFor(storeName);
  const overrides = resolveRequestConfig(triggerEl, op, app, targetEl);

  app.stores[op](storeName, { overrides, nestedPath, action });
}

/**
 * Fires a push when the target store is edited (the `edit` trigger).
 */
function bindStoreEditTrigger(
  app: RouseApp,
  storeName: string,
  modifiers: TriggerDef['modifiers'],
  fire: VoidFn,
  nestedPath: string,
): VoidFn {
  const rootKey = nestedPath ? getPathRoot(nestedPath) : null;

  const guardedFire = () => {
    const status = app.stores.status(storeName);
    if (!status) return;
    const hasDirty = rootKey
      ? !!status.dirty[rootKey]
      : Object.keys(status.dirty).length > 0;
    if (!hasDirty) return;
    fire();
  };

  const debouncedFire = applyTiming(guardedFire, modifiers);
  const stopListener = app.stores.onEdit(storeName, debouncedFire);

  return () => {
    debouncedFire.cancel();
    stopListener();
  };
}
