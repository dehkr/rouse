import type { RouseApp } from '../core/app';
import { parseModifiers } from '../core/parser';
import { resolveProps, splitInjection } from '../core/props';
import { err, getDirectiveValue, hasDirective, warn } from '../core/shared';
import { cleanup, on } from '../dom/utils';
import type { BoundDirective, CleanupFunction, Controller } from '../types';

export const rzOn = {
  existsOn,
  getValue,
  attach,
} as const satisfies BoundDirective;

function existsOn(el: Element) {
  return hasDirective(el, 'on');
}

function getValue(el: Element) {
  return getDirectiveValue(el, 'on');
}

function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  key: string,
  value: string,
): CleanupFunction {
  const { key: event, modifiers } = parseModifiers(key);
  const { key: methodName, rawPayload } = splitInjection(value);

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
          rawPayload !== undefined ? resolveProps(rawPayload, app.stores) : undefined;
        method.call(scope, payload, e);
      } catch (error) {
        err(`Failed to execute '${methodName}()'.`, error);
      }
    },
    modifiers,
  );

  return cleanup(removeListener);
}
