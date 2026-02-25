import { resolvePayload, splitInjection } from '../dom/utils';
import type { RouseController } from '../types';

export const SLUG = 'on' as const;

export function attachOn(
  el: HTMLElement,
  instance: RouseController,
  evtName: string,
  rawMethod: string,
): () => void {
  const { key: methodName, rawPayload } = splitInjection(rawMethod);

  // Validate that the method actually exists on the controller instance
  if (typeof instance[methodName] !== 'function') {
    console.warn(`[Rouse] Method "${methodName}" not found.`);
    return () => {};
  }

  const handler = (e: Event) => {
    // Resolve payload lazily when event is triggered
    const payload = rawPayload !== undefined ? resolvePayload(rawPayload) : undefined;
    instance[methodName](payload, e);
  };

  el.addEventListener(evtName, handler);

  // Return the cleanup
  return () => el.removeEventListener(evtName, handler);
}
