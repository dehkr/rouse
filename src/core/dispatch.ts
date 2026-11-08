/*
 * Every event fires from the element it describes. Once that element has left the
 * DOM, it fires from the app root instead, so `app.on` hears it on every path. A
 * removal is seen by the `MutationObserver` only after the fact, so teardown events,
 * and the late events of a request whose trigger was removed, would otherwise
 * propagate through a detached subtree and never reach the root.
 *
 * The fallback is resolved at dispatch time, not when the operation started. Each
 * event's `detail` must name its element, since `e.target` may be the root.
 */
import type { LifecycleEventMap } from '../types';

/**
 * Dispatches a custom event from `el`, or from `root` once `el` has left the DOM.
 *
 * @param options - Allows overriding cancelable/bubbles
 */
export function dispatch<N extends string>(
  el: Element,
  root: Element,
  name: N,
  detail?: N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any,
  options?: CustomEventInit,
): CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>;

export function dispatch(
  el: Element,
  root: Element,
  name: string,
  detail: any = {},
  options: CustomEventInit = {},
): CustomEvent {
  const event = new CustomEvent(name, {
    bubbles: true,
    cancelable: false,
    ...options,
    detail,
  });
  (el.isConnected ? el : root).dispatchEvent(event);

  return event;
}
