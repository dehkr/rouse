import type { RouseApp } from '../core/app';
import type { SwapMethod } from '../core/constants';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './events';

/**
 * Listens to the app root for HTML fetch responses and routes the payloads into DOM
 * targets named by `rz-target` or a server `Rouse-Target` header. Error responses route
 * only when the server names a target, since `rz-target` is success-only output.
 */
export function initDomRouter(app: RouseApp, signal: AbortSignal) {
  const route = (e: Event) => {
    const { target, detail } = e as CustomEvent<RouseResponse>;
    const { config, data, targetOverride } = detail;

    // Programmatic `fetch` defaults to `swap: false`; it doesn't auto-update the DOM
    if (config?.swap === false) return;
    // An empty response (`null`) or non-string body has nothing to swap
    if (typeof data !== 'string') return;
    // Don't route an error response unless the server provides an override
    if (e.type.includes('error') && !targetOverride) return;

    const operations = rzTarget.getConfig(
      target as Element,
      app.root,
      targetOverride,
    ).swaps;

    for (const { targets, method } of operations) {
      for (const targetEl of targets) {
        swap(data, targetEl, method, 'fetch');
      }
    }
  };

  for (const eventType of ['success', 'error']) {
    app.root.addEventListener(`rz:fetch:${eventType}:html`, route, { signal });
  }
}

/**
 * Swaps HTML content into a target element using the given method (`innerHTML`,
 * `outerHTML`, `delete`, or an `insertAdjacentHTML` position such as `beforeend`).
 *
 * Fires a cancelable `rz:dom:swap:before` event first — a listener can cancel it
 * to skip the swap, or mutate `detail.payload` to change what gets written — then
 * a `rz:dom:swap` event after. For `outerHTML` and `delete`, both events fire from
 * the target's parent, since the target itself is replaced or removed.
 *
 * @param content - The HTML string to swap in (ignored for `delete`).
 * @param target - The element to swap into, replace, or remove.
 * @param method - How to place the content. Defaults to `innerHTML`.
 * @param source - Marks the swap as `fetch`-driven or `programmatic` (default); surfaced on both lifecycle events.
 */
export function swap(
  content: string,
  target: Element,
  method: SwapMethod = 'innerHTML',
  source: 'fetch' | 'programmatic' = 'programmatic',
) {
  const dispatcherEl =
    method === 'outerHTML' || method === 'delete'
      ? target.parentElement || target
      : target;

  const beforeEvent = dispatch(
    dispatcherEl,
    'rz:dom:swap:before',
    { target, method, payload: content, source },
    { cancelable: true },
  );

  if (beforeEvent.defaultPrevented) return;
  const finalContent = beforeEvent.detail.payload;

  switch (method) {
    case 'delete':
      target.remove();
      break;
    case 'innerHTML':
      target.innerHTML = finalContent;
      break;
    case 'outerHTML':
      target.outerHTML = finalContent;
      break;
    default:
      target.insertAdjacentHTML(method, finalContent);
  }

  dispatch(dispatcherEl, 'rz:dom:swap', {
    target,
    method,
    payload: finalContent,
    source,
  });
}
