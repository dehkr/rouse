import type { RouseApp } from '../core/app';
import { parseModifiers } from '../core/parser';
import { err, getDirectiveValue, hasDirective, warn } from '../core/shared';
import { cleanup, on, resolvePayload, splitInjection } from '../dom/utils';
import type { BoundDirective, CleanupFunction, Controller } from '../types';

export const rzOn = {
  existsOn,
  getRawValue,
  attach,
} as const satisfies BoundDirective;

function existsOn(el: Element) {
  return hasDirective(el, 'on');
}

function getRawValue(el: Element) {
  return getDirectiveValue(el, 'on');
}

function attach(
  el: HTMLElement,
  scope: Controller,
  app: RouseApp,
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

  const removeListener = on(
    el,
    event,
    (e: Event) => {
      try {
        const payload =
          rawPayload !== undefined ? resolvePayload(rawPayload, app.stores) : undefined;
        method.call(scope, payload, e);
      } catch (error) {
        err(`Failed to execute '${methodName}()'.`, error);
      }
    },
    modifiers,
  );

  return cleanup(removeListener);
}
