import type { RouseApp } from '../core/app';
import { STORE_PREFIX } from '../core/constants';
import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue, warn } from '../core/shared';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './scheduler';

/**
 * Listens to successful JSON network requests and routes the data
 * payloads directly into the global reactive stores.
 */
export function initStoreRouter(app: RouseApp, signal: AbortSignal) {
  app.root.addEventListener(
    'rz:fetch:success:json',
    (e) => {
      const { target: el, detail: result } = e as CustomEvent<RouseResponse>;
      routeToStore(
        app,
        // `targetOverride` (e.g., a server header) beats the attribute value
        result.targetOverride || getDirectiveValue(el as Element, rzTarget.slug),
        result.data,
      );
    },
    { signal },
  );
}

function routeToStore(app: RouseApp, targetStr: string | null, payload: any) {
  if (!targetStr?.trim()) return;

  const operations = parseDirectiveValue(targetStr);

  for (const [method, selector] of operations) {
    const target = selector || method;

    if (target.startsWith(STORE_PREFIX)) {
      const storeName = target.substring(1);
      const targetEl = app.stores.elementFor(storeName) || app.root;

      // Dispatch `before` event to enable payload mutation or cancellation
      const beforeEvent = dispatch(
        targetEl,
        'rz:store:sync:before',
        { storeName, operation: 'pull', data: app.stores.get(storeName), payload },
        { cancelable: true },
      );

      if (beforeEvent.defaultPrevented) continue;

      // Perform the update using the potentially mutated payload
      app.stores.update(storeName, beforeEvent.detail.payload as object);

      dispatch(targetEl, 'rz:store:sync', {
        storeName,
        operation: 'pull',
        data: app.stores.get(storeName),
      });
    } else {
      warn(`Cannot route JSON payload to DOM target '${target}'.`);
    }
  }
}
