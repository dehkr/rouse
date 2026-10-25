import type { RouseApp } from '../core/app';
import { warn } from '../core/diagnostics';
import { isPlainObject } from '../core/state';
import { rzDeposit } from '../directives';
import { rzPlace } from '../directives/rz-place';
import type { RouseResponse, RoutablePayload } from '../types';
import { placeInto } from './placer';

/** What produced a routable payload. */
type PayloadSource = 'fetch' | 'sse';

/**
 * Listens to the app root for routable payloads from fetch responses and stream
 * messages, and sends each to its destination. HTML goes to the DOM targets named by
 * `rz-place` or a server `Rouse-Place` header. JSON goes to the stores named by
 * `rz-deposit` or a server `Rouse-Deposit` header, as a merge patch through
 * `app.stores.deposit()`.
 *
 * A programmatic fetch doesn't have an element, so it doesn't route by default. A
 * server-named destination can route the payload, or the caller can place or deposit
 * it. The `triggerEl` option is configurable, however, so a pre-configured element can
 * be triggered remotely. Error responses route only when the server names a
 * destination, since `rz-place` and `rz-deposit` are success-only output.
 */
export function initPayloadRouters(app: RouseApp, signal: AbortSignal) {
  listenForPayloads(app, signal, 'html', 'placeOverride', (detail, source, host) => {
    const { data, placeOverride } = detail;

    // An empty fetch response arrives as `null`. It places only under `Rouse-Place`,
    // where the header itself is the instruction, so a plain 204 leaves the page alone.
    const content = data == null && placeOverride ? '' : data;
    if (typeof content !== 'string') return;

    for (const { targets, position } of rzPlace.getConfig(
      host,
      app.root,
      placeOverride,
    )) {
      targets.forEach((targetEl) => placeInto(targetEl, content, position, source));
    }
  });

  listenForPayloads(app, signal, 'json', 'depositOverride', (detail, operation, host) => {
    const { data, depositOverride } = detail;

    const stores = rzDeposit.getConfig(host, depositOverride);
    if (stores.length === 0) return;

    if (!isPlainObject(data)) {
      __DEV__ &&
        warn('Cannot route JSON payload to a store. Expected a JSON object.', data);
      return;
    }

    // Only the fetch listeners are registered with a `RouseResponse` detail
    const response = operation === 'fetch' ? (detail as RouseResponse) : undefined;

    stores.forEach((storeName) =>
      app.stores.deposit(storeName, data, { response, operation }),
    );
  });
}

/**
 * Listens on the app root for one kind of payload, and hands each to `route` with its
 * source and the element whose directive names the destination.
 *
 * `override` names the server header field that can stand in for the element's
 * directive. Without it, an error response routes nothing, and neither does a payload
 * with no originating element.
 */
function listenForPayloads(
  app: RouseApp,
  signal: AbortSignal,
  kind: 'html' | 'json',
  override: 'placeOverride' | 'depositOverride',
  route: (detail: RoutablePayload, source: PayloadSource, host: Element) => void,
) {
  const listen = (name: string, source: PayloadSource) => {
    app.root.addEventListener(
      name,
      (e) => {
        const { detail } = e as CustomEvent<RoutablePayload>;
        const triggerEl = detail.config?.triggerEl;

        if (!detail[override]) {
          if (e.type.includes('error')) return;
          // No originating element means no destination or host for the declarative path
          if (!triggerEl) return;
        }

        route(detail, source, triggerEl ?? app.root);
      },
      { signal },
    );
  };

  listen(`rz:fetch:success:${kind}`, 'fetch');
  listen(`rz:fetch:error:${kind}`, 'fetch');
  listen(`rz:sse:message:${kind}`, 'sse');
}
