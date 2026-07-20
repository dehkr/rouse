import type { RouseApp } from '../core/app';
import type { PatchAction } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseStoreSubject } from '../core/parser';
import { resolveTarget } from '../core/store';
import { dispatchTrigger } from '../dom/events';
import { resolveRequestConfig } from '../net/request';
import type { VoidFn } from '../types';
import { defineNetworkDirective } from './network-directive';

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
    __DEV__ && warn(`rz-pull: store '@${storeName}' not found.`, triggerEl);
    return;
  }
  if (status.loading) return;

  const targetEl = app.stores.elementFor(storeName);
  const overrides = resolveRequestConfig(triggerEl, 'pull', app, targetEl);

  app.stores.pull(storeName, { overrides, nestedPath, action });
}

/**
 * Definition for the `rz-pull` directive object. Wires each parsed
 * `[trigger]: [[action] @store[.path]]` pair to pull server state into
 * a local store.
 */
export const rzPull = defineNetworkDirective('pull', 'load: @user', (el, app, pairs) => {
  const cleanups: VoidFn[] = [];

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
      cleanups.push(cleanup);
    }
  }

  return cleanups;
});
