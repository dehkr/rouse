import type { RouseApp } from '../core/app';
import { parseModifiers } from '../core/parser';
import { getNestedVal } from '../core/path';
import { resolveProps, splitInjection } from '../core/props';
import { err, getDirectiveValue, hasDirective, warn } from '../core/shared';
import { parseStoreLocator } from '../core/store';
import { cleanup, on } from '../dom/utils';
import type { BoundDirective, CleanupFunction, Controller } from '../types';

export const rzOn = {
  existsOn: (el: Element) => hasDirective(el, 'on'),
  getValue: (el: Element) => getDirectiveValue(el, 'on'),
  attach,
} as const satisfies BoundDirective;

function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  key: string,
  value: string,
): CleanupFunction | void {
  const { key: event, modifiers } = parseModifiers(key);
  const { key: methodName, rawPayload } = splitInjection(value);

  let method: unknown;
  let context: unknown;

  // Global store (e.g., '@my-store.__actions.save' or '@theme.toggleMode')
  if (methodName.startsWith('@')) {
    const { storeName, nestedPath } = parseStoreLocator(methodName);
    const storeData = app.stores.get(storeName);

    if (storeData === undefined) {
      warn(`Store '${storeName}' not found.`);
      return;
    }

    if (!nestedPath) {
      warn(`No action specified for store '${storeName}'.`);
      return;
    }

    method = getNestedVal(storeData, nestedPath);
    context = storeData;
  }

  // Local controller method
  else {
    method = scope[methodName];
    context = scope;
  }

  // Validate that the resolved target is actually a function
  if (typeof method !== 'function') {
    warn(`Method '${methodName}' not found.`);
    return;
  }

  const removeListener = on(
    el,
    event,
    (e: Event) => {
      try {
        const payload =
          rawPayload !== undefined ? resolveProps(rawPayload, app.stores) : undefined;
        method.call(context, payload, e);
      } catch (error) {
        err(`Failed to execute '${methodName}()'.`, error);
      }
    },
    modifiers,
  );

  return cleanup(removeListener);
}
