import type { RouseApp } from '../core/app';
import { resolveState, writeState } from '../core/path';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { getModelableValue, setModelableValue } from '../dom/updater';
import { cleanup, is } from '../dom/utils';
import { effect } from '../reactivity';
import type {
  BindableValue,
  BoundDirective,
  CleanupFunction,
  Controller,
  DirectiveSlug,
} from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'model' as const satisfies DirectiveSlug;

export const rzModel = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attach,
} as const satisfies BoundDirective;

// =======================================================================================

/**
 * Two-way binding for form elements
 */
function attach(
  el: Element,
  scope: Controller,
  app: RouseApp,
  prop: string,
): CleanupFunction {
  // State -> DOM
  const stopEffect = effect(() => {
    const val = resolveState<BindableValue>(prop, scope, app.stores);
    setModelableValue(el, val);
  });

  // Determine best event type
  const isBinary = is(el, 'Input') && (el.type === 'checkbox' || el.type === 'radio');
  const eventType = is(el, 'Select') || isBinary ? 'change' : 'input';

  // State <- DOM
  const handler = () => {
    const newVal = getModelableValue(el);
    writeState(prop, newVal, scope, app.stores);
  };

  el.addEventListener(eventType, handler);

  return cleanup(() => {
    stopEffect();
    el.removeEventListener(eventType, handler);
  });
}
