import type { RouseApp } from '../app';
import { warn } from '../core/diagnostics';
import { holderOf, invokeHandler } from '../core/invoke';
import { parseTriggers } from '../core/parser';
import { resolveState } from '../core/resolve';
import { dispatchTrigger } from '../dom/events';
import type { AnyFn, BoundDirective, Scope, VoidFn } from '../types';

function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  value: string,
): VoidFn[] {
  const path = value.trim();
  if (!path) {
    if (__DEV__) {
      warn(
        `rz-on: value '${key}' is incomplete; at least one trigger and a handler are required.`,
        el,
      );
    }
    return [];
  }

  const resolveMethod = (): AnyFn | null => {
    const method = resolveState(path, scope, app.stores);
    if (typeof method === 'function') {
      return method as AnyFn;
    }
    if (__DEV__) {
      warn(`rz-on: handler '${path}' is undefined or not a function.`, el);
    }
    return null;
  };

  // Resolved at bind so a typo warns before the first event, and again per event: a
  // keyed `rz-render` instance can swap its item, and `~item` must reach the current one
  if (!resolveMethod()) {
    return [];
  }

  return parseTriggers(key).map((trigger) =>
    dispatchTrigger(trigger, {
      el,
      app,
      action: (e?: Event) => {
        const method = resolveMethod();
        if (method) {
          invokeHandler(
            method,
            holderOf(path, scope, app.stores),
            path,
            scope,
            el,
            e ?? new CustomEvent(trigger.event),
          );
        }
      },
    }),
  );
}

export const rzOn = {
  slug: 'on',
  bind,
} as const satisfies BoundDirective;
