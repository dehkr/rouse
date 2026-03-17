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

  // Resolve target and options
  const target = resolveListenerTarget(el, modifiers);
  const options = getListenerOptions(modifiers);

  const handler = (e: Event) => {
    if (!applyModifiers(e, el, modifiers)) return;

    // Resolve payload lazily when event is triggered
    const payload = rawPayload !== undefined ? resolvePayload(rawPayload) : undefined;
    method.call(instance, payload, e);
  };

  target.addEventListener(evtName, handler, options);

  // Return the cleanup
  return () => target.removeEventListener(evtName, handler, options);
}
