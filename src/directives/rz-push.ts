import type { RouseApp } from '../core/app';
import type { PatchAction } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseStoreSubject } from '../core/parser';
import { getPathRoot } from '../core/path';
import { resolveTarget } from '../core/store';
import { applyTiming } from '../core/timing';
import { dispatchTrigger } from '../dom/events';
import { resolveRequestConfig } from '../net/request';
import type { TriggerDef, VoidFn } from '../types';
import { defineNetworkDirective } from './network-directive';

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
 * Fires `triggerPush` whenever the store data changes.
 */
function attachMutateEffect(
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

/**
 * Wires each parsed `[trigger]: [[action] @store[.path]]` pair to push local
 * store state to the server.
 */
export const rzPush = defineNetworkDirective('push', 'click: @user', (el, app, pairs) => {
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

  return cleanups;
});
