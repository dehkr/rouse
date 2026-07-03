import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { resolveState, writeState } from '../core/path';
import { warn } from '../core/shared';
import { dispatchTrigger } from '../dom/scheduler';
import { getModelableValue, setModelableValue } from '../dom/updater';
import { boundCleanup, is } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  BoundCleanupFn,
  BoundDirective,
  DirectiveSlug,
  Scope,
  TriggerDef,
  VoidFn,
} from '../types';

const SLUG = 'model' as const satisfies DirectiveSlug;

/**
 * Returns the default trigger for a given element. Custom elements and
 * anything without a known default return `null`.
 */
function modelDefaultTrigger(el: Element): TriggerDef | null {
  const def = (event: string) => ({ event, modifiers: [] });

  if (is(el, 'TextArea') || (el as HTMLElement).isContentEditable) {
    return def('input');
  }
  if (is(el, 'Input')) {
    return el.type === 'checkbox' || el.type === 'radio' ? def('change') : def('input');
  }
  if (is(el, 'Select')) {
    return def('change');
  }

  return null;
}

/**
 * Two-way binding for form elements.
 */
function bind(
  el: Element,
  scope: Scope,
  app: RouseApp,
  key: string,
  value: string,
): BoundCleanupFn | undefined {
  const subject = value || key;

  let triggers: TriggerDef[];
  if (value) {
    triggers = parseTriggers(key);
  } else {
    const def = modelDefaultTrigger(el);
    if (!def) {
      __DEV__ &&
        warn(
          `rz-model: an explicit trigger is required when used on <${el.tagName.toLowerCase()}> (e.g., rz-model="input: value").`,
          el,
        );
      return;
    }
    triggers = [def];
  }

  // State -> DOM
  const stopEffect = effect(() => {
    setModelableValue(el, resolveState<BindableValue>(subject, scope, app.stores));
  });

  // DOM -> State
  const action = () => writeState(subject, getModelableValue(el), scope, app.stores);

  const teardowns: VoidFn[] = [];
  for (const trigger of triggers) {
    const cleanup = dispatchTrigger(trigger, { el, app, action });
    if (cleanup) teardowns.push(cleanup);
  }

  return boundCleanup(() => {
    stopEffect();
    teardowns.forEach((fn) => fn());
  });
}

export const rzModel = {
  slug: SLUG,
  bind,
} as const satisfies BoundDirective;
