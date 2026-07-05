import type { RouseApp } from '../core/app';
import { warn } from '../core/shared';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './scheduler';

/**
 * Routes successful JSON responses into global stores named by `rz-target`
 * (`@store` targets) or a server `Rouse-Target` header. The JSON/store
 * counterpart to `dom/swapper.ts`, which handles `rz-target`'s DOM-swap half.
 */
export function initStoreRouter(app: RouseApp, signal: AbortSignal) {
  app.root.addEventListener(
    'rz:fetch:success:json',
    (e) => {
      const { target: el, detail: result } = e as CustomEvent<RouseResponse>;
      // `getConfig` applies `targetOverride || rz-target` precedence itself
      const { stores } = rzTarget.getConfig(
        el as Element,
        app.root,
        result.targetOverride,
      );
      routeToStore(app, stores, result.data);
    },
    { signal },
  );

  // Errors route only when the server names a store via `Rouse-Target`.
  app.root.addEventListener(
    'rz:fetch:error:json',
    (e) => {
      const { detail: result } = e as CustomEvent<RouseResponse>;
      const stores = result.targetOverride
        ? rzTarget.getConfig(e.target as Element, app.root, result.targetOverride).stores
        : [];
      routeToStore(app, stores, result.data);
    },
    { signal },
  );
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
