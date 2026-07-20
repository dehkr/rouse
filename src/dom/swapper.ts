import type { SwapMethod } from '../core/constants';
import { rzTarget } from '../directives';
import type { RouseResponse } from '../types';
import { dispatch } from './events';

/**
 * Listens globally for HTML fetch responses (successes, and errors the
 * server targets via `Rouse-Target`) and mutates the DOM accordingly.
 */
export function initDomSwapper(appRoot: Element, abortSignal: AbortSignal) {
  const handleSwap = (e: Event) => {
    const { detail, target } = e as CustomEvent<RouseResponse>;
    const { data, config, targetOverride } = detail;
    const triggerEl = target as Element;

    // Programmatic fetch (`app.fetch`, `ctx.fetch`) defaults to `swap: false`
    // so it doesn't auto-update the DOM, unlike `rz-fetch`.
    if (config?.swap === false) return;
    if (typeof data !== 'string') return;

    // Errors route only when the server names a target via `Rouse-Target`.
    // `rz-target` is intended for success output, not error content.
    if (e.type.includes('error') && !targetOverride) return;

    const operations = rzTarget.getConfig(triggerEl, appRoot, targetOverride).swaps;

    for (const { targets, method } of operations) {
      for (const targetEl of targets) {
        swap(data, targetEl, method, 'fetch');
      }
    }
  };

  for (const eventName of ['rz:fetch:success:html', 'rz:fetch:error:html']) {
    appRoot.addEventListener(eventName, handleSwap, { signal: abortSignal });
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
