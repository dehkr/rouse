import { getApp } from '../core/app';
import { parseModifiers } from '../core/parser';
import { err, warn } from '../core/shared';
import { cleanup, on, resolvePayload, splitInjection } from '../dom/utils';
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
    warn(`Method '${methodName}' not found.`);
    return cleanup(() => {});
  }

  const app = getApp(el);

  const removeListener = on(
    el,
    event,
    (e: Event) => {
      try {
        const payload =
          rawPayload !== undefined ? resolvePayload(rawPayload, app?.stores) : undefined;
        method.call(scope, payload, e);
      } catch (error) {
        err(`Failed to execute ${methodName}().`, error);
      }
    },
    modifiers,
  );

  return cleanup(removeListener);
}
