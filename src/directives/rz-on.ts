import { getApp } from '../core/app';
import { applyTiming } from '../core/timing';
import {
  applyModifiers,
  getListenerOptions,
  resolveListenerTarget,
} from '../dom/modifiers';
import { resolvePayload, splitInjection } from '../dom/utils';
import type { RouseController } from '../types';

export const SLUG = 'on' as const;

export function attachOn(
  el: HTMLElement,
  instance: RouseController,
  evtName: string,
  rawMethod: string,
  modifiers: string[] = [],
): () => void {
  const { key: methodName, rawPayload } = splitInjection(rawMethod);

  // Validate that the method actually exists
  const method = instance[methodName];

  if (typeof method !== 'function') {
    console.warn(`[Rouse] Method "${methodName}" not found on controller.`);
    return () => {};
  }

  const app = getApp(el);

  const pacedMethod = applyTiming(
    (payload: any, e: Event) => {
      try {
        method.call(instance, payload, e);
      } catch (error) {
        console.error(`[Rouse] Failed to execute ${methodName}().`, error);
      }
    },
    modifiers,
    app?.config.timing,
  );

  // Resolve target and options
  const target = resolveListenerTarget(el, modifiers);
  const options = getListenerOptions(modifiers);

  const handler = (e: Event) => {
    // Synchronous event modifiers (.prevent, .stop, key matching)
    if (!applyModifiers(e, el, modifiers)) return;

    // Synchronous payload resolution (captures state when the event fires)
    const payload =
      rawPayload !== undefined ? resolvePayload(rawPayload, app?.stores) : undefined;

    // Pass the captured data to the paced function
    pacedMethod(payload, e);
  };

  target.addEventListener(evtName, handler, options);

  // Return the cleanup
  return () => {
    target.removeEventListener(evtName, handler, options);
    // Cancel pending delayed executions
    pacedMethod.cancel();
  };
}
