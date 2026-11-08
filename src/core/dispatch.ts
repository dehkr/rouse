/*
 * Rouse's own events go through `dispatchFrom`, never the public `dispatch`. Every
 * event fires from the element it describes, or from the app root once that element
 * has left the DOM, so `app.on` hears it on every path. The `MutationObserver` sees a
 * removal only after the fact, so teardown events, and the late events of a request
 * whose trigger was removed, would otherwise propagate through a detached subtree.
 *
 * The fallback is resolved at dispatch time. Each event's `detail` must name its
 * element, since `e.target` may be the root.
 */
import type { LifecycleEventMap } from '../types';

/**
 * Dispatches a custom event from an element.
 *
 * @param options - Allows overriding cancelable/bubbles
 */
export function dispatch<N extends string>(
  el: EventTarget,
  name: N,
  detail?: N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any,
  options?: CustomEventInit,
): CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>;

export function dispatch(
  el: EventTarget,
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
  el.dispatchEvent(event);

  return event;
}

/** Dispatches from `el`, or from `root` once `el` has left the DOM. */
export function dispatchFrom<N extends string>(
  el: Element,
  root: Element,
  name: N,
  detail?: N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any,
  options?: CustomEventInit,
): CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any> {
  return dispatch(el.isConnected ? el : root, name, detail, options);
}
