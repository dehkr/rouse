import { getApp } from '../core/app';
import { parseModifiers } from '../core/parser';
import { applyTiming } from '../core/timing';
import {
  applyModifiers,
  getListenerOptions,
  resolveListenerTarget,
} from '../dom/modifiers';
import { cleanup, resolvePayload, splitInjection } from '../dom/utils';
import type { CleanupFunction, DirectiveSchema, RouseController } from '../types';

export const rzOn = {
  slug: 'on',
  handler: attachOn,
} as const satisfies DirectiveSchema;

export function attachOn(
  el: HTMLElement,
  scope: RouseController,
  rawEvent: string,
  rawMethod: string,
): CleanupFunction {
  const { key: event, modifiers } = parseModifiers(rawEvent);
  const { key: methodName, rawPayload } = splitInjection(rawMethod);

  // Validate that the method actually exists
  const method = scope[methodName];
  if (typeof method !== 'function') {
    console.warn(`[Rouse] Method '${methodName}' not found on controller.`);
    return cleanup(() => {});
  }

  const app = getApp(el);

  const pacedMethod = applyTiming(
    (payload: any, e: Event) => {
      try {
        method.call(scope, payload, e);
      } catch (error) {
        console.error(`[Rouse] Failed to execute ${methodName}().`, error);
      }
    },
    modifiers,
    app?.config.timing,
  );

  const target = resolveListenerTarget(el, modifiers);
  const options = getListenerOptions(modifiers);

  const handler = (e: Event) => {
    if (!applyModifiers(e, el, modifiers)) return;
    // Synchronous payload resolution (captures state when the event fires)
    const payload =
      rawPayload !== undefined ? resolvePayload(rawPayload, app?.stores) : undefined;
    // Pass the captured data to the paced function
    pacedMethod(payload, e);
  };

  target.addEventListener(event, handler, options);

  return cleanup(() => {
    target.removeEventListener(event, handler, options);
    pacedMethod.cancel();
  });
}
