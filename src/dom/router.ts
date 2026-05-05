import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { warn } from '../core/shared';
import { rzError, rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './scheduler';

/**
 * Listens to successful and failed JSON network requests and routes
 * the data payloads directly into the global reactive stores.
 */
export function initStoreRouter(app: RouseApp, signal: AbortSignal) {
  const routers = [
    {
      event: 'rz:fetch:success:json',
      directive: rzTarget,
      getPayload: (result: RouseResponse) => result.data,
    },
    {
      event: 'rz:fetch:error:json',
      directive: rzError,
      getPayload: (result: RouseResponse) => result.error?.validation || result.error,
    },
  ] as const;

  routers.forEach(({ event, directive, getPayload }) => {
    app.root.addEventListener(
      event,
      (e) => {
        const { target: el, detail: result } = e as CustomEvent<RouseResponse>;
        const triggerEl = el as Element;

        routeToStore(
          app,
          // `targetOverride` (e.g., a server header) beats the attribute value
          result.targetOverride || directive.getValue(el as Element),
          getPayload(result),
          triggerEl,
        );
      },
      { signal },
    );
  });
}

function routeToStore(
  app: RouseApp,
  targetStr: string | null,
  payload: any,
  triggerEl: Element,
) {
  if (!targetStr?.trim()) return;

  const operations = parseDirectiveValue(targetStr);

  for (const [method, selector] of operations) {
    const target = selector || method;

    if (target.startsWith('@')) {
      const storeName = target.substring(1);

      // Dispatch `before` event to enable payload mutation or cancellation
      const beforeEvent = dispatch(
        triggerEl,
        'rz:fetch:update:store:before',
        { store: storeName, payload, triggerEl },
        { cancelable: true },
      );

      if (beforeEvent.defaultPrevented) continue;

      // Perform the update using the potentially mutated payload
      app.stores.update(storeName, beforeEvent.detail.payload as object);

      dispatch(triggerEl, 'rz:fetch:update:store', { store: storeName, triggerEl });
    } else {
      warn(`Cannot route JSON payload to DOM target '${target}'.`);
    }
  }
}
