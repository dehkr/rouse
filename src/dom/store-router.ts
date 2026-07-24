import type { RouseApp } from '../core/app';
import { warn } from '../core/diagnostics';
import { isPlainObject } from '../core/state';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './events';

/**
 * Listens to the app root for JSON fetch responses and routes the payloads into global
 * stores named by `rz-target` or a server `Rouse-Target` header. Error responses route
 * only when the server names a target, since `rz-target` is success-only output.
 */
export function initStoreRouter(app: RouseApp, signal: AbortSignal) {
  const route = (e: Event) => {
    const { target, detail } = e as CustomEvent<RouseResponse>;
    const { data, targetOverride } = detail;

    // Don't route an error response unless the server provides an override
    if (e.type.includes('error') && !targetOverride) return;

    routeToStore(
      app,
      rzTarget.getConfig(target as Element, app.root, targetOverride).stores,
      data,
    );
  };

  for (const eventType of ['success', 'error']) {
    app.root.addEventListener(`rz:fetch:${eventType}:json`, route, { signal });
  }
}

/**
 * Deposits a JSON `payload` into each named store via `app.stores.update`; a
 * whole-payload deposit, not the per-field reconciliation `rz-pull` performs.
 * Non-POJO payloads and unknown store names warn and are skipped.
 *
 * @param stores - Store names to deposit into (from `rz-target`'s `@store` targets).
 * @param payload - The parsed JSON body to write into each store.
 */
function routeToStore(app: RouseApp, stores: string[], payload: any) {
  if (stores.length === 0) return;

  if (!isPlainObject(payload)) {
    __DEV__ &&
      warn('Cannot route JSON payload to a store. Expected a JSON object.', payload);
    return;
  }

  for (const storeName of stores) {
    if (!app.stores.has(storeName)) {
      __DEV__ && warn(`Cannot route JSON payload to '@${storeName}'. No such store.`);
      continue;
    }

    const data = app.stores.get(storeName);
    const targetEl = app.stores.elementFor(storeName) || app.root;

    const beforeEvent = dispatch(
      targetEl,
      'rz:store:sync:before',
      { storeName, operation: 'fetch', data, payload },
      { cancelable: true },
    );

    if (beforeEvent.defaultPrevented) continue;

    app.stores.update(storeName, beforeEvent.detail.payload as object);
    app.stores._markSynced(storeName);
    dispatch(targetEl, 'rz:store:sync', { storeName, operation: 'fetch', data });
  }
}
