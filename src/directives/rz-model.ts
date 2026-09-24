import { effect } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { directiveSelector } from '../core/attributes';
import { warn } from '../core/diagnostics';
import { resolveState, writeState } from '../core/resolve';
import { dispatchTrigger } from '../dom/events';
import { getModelableValue, setModelableValue } from '../dom/updater';
import type {
  BindableValue,
  BoundCleanupFn,
  BoundDirective,
  Scope,
  TriggerDef,
} from '../types';
import { rzWrite } from './rz-write';

/**
 * Returns the default trigger for a given element. Custom elements and
 * anything without a known default return `null`.
 */
function modelDefaultTrigger(el: Element): TriggerDef | null {
  const def = (event: string) => ({ event, options: {} });

  if (el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable) {
    return def('input');
  }
  if (el instanceof HTMLInputElement) {
    return el.type === 'checkbox' || el.type === 'radio' ? def('change') : def('input');
  }
  if (el instanceof HTMLSelectElement) {
    return def('change');
  }

  return null;
}

/**
 * Wires two-way binding on an editable element: an effect writes resolved state
 * into the element, and each trigger writes the element's value back.
 *
 * The value is an element property. Triggers come from `rz-write`, falling back to the element's own
 * default. Binds nothing when neither supplies one.
 */
function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  subject: string,
): BoundCleanupFn | undefined {
  let triggers = rzWrite.getConfig(el);

  if (triggers.length === 0) {
    const def = modelDefaultTrigger(el);
    if (!def) {
      __DEV__ &&
        warn(
          `rz-model: <${el.tagName.toLowerCase()}> requires at least one trigger set by 'data-rz-write'.`,
          el,
        );
      return;
    }
    triggers = [def];
  }

  const cleanups = [
    effect(() => {
      // State -> DOM
      setModelableValue(el, resolveState<BindableValue>(subject, scope, app.stores));
    }),
  ];

  // DOM -> State
  const action = () => writeState(subject, getModelableValue(el), scope, app.stores);

  for (const trigger of triggers) {
    const cleanup = dispatchTrigger(trigger, { el, app, action });
    if (cleanup) {
      cleanups.push(cleanup);
    }
  }

  return (() => cleanups.forEach((fn) => fn())) as BoundCleanupFn;
}

export const rzModel = {
  slug: 'model',
  selector: directiveSelector('model'),
  singleValue: true,
  bind,
} as const satisfies BoundDirective;
