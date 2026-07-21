import type { RouseApp } from '../core/app';
import { warn } from '../core/diagnostics';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './events';

/**
 * Routes JSON responses into global stores named by `rz-target` (`@store`
 * targets) or a server `Rouse-Target` header. Success responses honor both;
 * error responses route only when the server names a target, since `rz-target`
 * is success-only output. The JSON/store counterpart to `dom/swapper.ts`,
 * which handles `rz-target`'s DOM-swap half.
 */
export function initStoreRouter(app: RouseApp, signal: AbortSignal) {
  const route = (e: Event) => {
    const { target, detail } = e as CustomEvent<RouseResponse>;
    if (e.type.includes('error') && !detail.targetOverride) return;

    routeToStore(
      app,
      rzTarget.getConfig(target as Element, app.root, detail.targetOverride).stores,
      detail.data,
    );
  };

  for (const eventType of ['success', 'error']) {
    app.root.addEventListener(`rz:fetch:${eventType}:json`, route, { signal });
  }
}

function routeToStore(app: RouseApp, stores: string[], payload: any) {
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
      { storeName, operation: 'pull', data, payload },
      { cancelable: true },
    );

    if (beforeEvent.defaultPrevented) continue;

    app.stores.update(storeName, beforeEvent.detail.payload as object);
    dispatch(targetEl, 'rz:store:sync', { storeName, operation: 'pull', data });
  }
}
