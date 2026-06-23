import type { RouseApp } from '../core/app';
import { STORE_PREFIX } from '../core/constants';
import { resolveInjection, splitInjection } from '../core/injection';
import { parseStoreLocator, parseTriggers } from '../core/parser';
import { getNestedVal } from '../core/path';
import { renderCtxOf } from '../core/render';
import { err, warn } from '../core/shared';
import { dispatchTrigger } from '../dom/scheduler';
import { boundCleanup, defaultTriggerFor } from '../dom/utils';
import type {
  BoundCleanupFn,
  BoundDirective,
  DirectiveSlug,
  HandlerCtx,
  Scope,
  VoidFn,
} from '../types';

const SLUG = 'on' as const satisfies DirectiveSlug;

function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  value: string,
): BoundCleanupFn | undefined {
  const handlerRef = value || key;
  const triggerSource = value ? key : defaultTriggerFor(el);

  if (!triggerSource) {
    warn(`rz-on on <${el.tagName.toLowerCase()}> requires an explicit trigger.`);
    return undefined;
  }

  const { key: methodName, rawPayload } = splitInjection(handlerRef);

  let method: unknown;
  let context: unknown;

  // Global store (e.g., @theme.toggleMode')
  if (methodName.startsWith(STORE_PREFIX)) {
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

  // Local scope method
  else {
    method = scope[methodName];
    context = scope;
  }

  // Validate that the resolved target is actually a function
  if (typeof method !== 'function') {
    warn(`Method '${methodName}' not found.`);
    return;
  }

  const triggers = parseTriggers(triggerSource);
  const cleanups: VoidFn[] = [];

  for (const trigger of triggers) {
    const cleanup = dispatchTrigger(trigger, {
      el,
      app,
      action: (e?: Event) => {
        try {
          const data =
            rawPayload !== undefined
              ? (resolveInjection(rawPayload, app.stores) ?? {})
              : {};
          const args: HandlerCtx = {
            data,
            e: e ?? new CustomEvent(trigger.event),
            el,
            render: renderCtxOf(scope),
          };
          method.call(context, args);
        } catch (error) {
          err(`Failed to execute '${methodName}()'.`, error);
        }
      },
    });
    if (cleanup) cleanups.push(cleanup);
  }

  return boundCleanup(() => {
    cleanups.forEach((fn) => fn());
  });
}

export const rzOn = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
