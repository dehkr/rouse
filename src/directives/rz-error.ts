import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import {
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
  isJsonType,
} from '../core/shared';
import type { Directive, RouseResponse } from '../types';

export const rzError = {
  existsOn: (el: Element) => hasDirective(el, 'error'),
  getValue: (el: Element) => getDirectiveValue(el, 'error'),
  getDefinedValue: (el: Element) => getDefinedDirectiveValue(el, 'error'),
  route,
} as const satisfies Directive;

/**
 * Parses the rz-error directive (or target override) and routes the error payload
 * to the Store Manager or passes it through to the network engine.
 */
function route(el: Element, app: RouseApp, result: RouseResponse) {
  if (!result.error) return;

  const errorTarget = result.targetOverride || getDefinedDirectiveValue(el, 'error');
  if (!errorTarget) return;

  const contentType = result.response?.headers.get('Content-Type') || '';
  const isJson = isJsonType(contentType);
  const operations = parseDirectiveValue(errorTarget);

  for (const [method, selector] of operations) {
    const targetStr = selector || method;

    // Route to store manager
    if (targetStr.startsWith('@')) {
      if (isJson) {
        const payload = result.error.validation || result.error;
        app.stores.update(targetStr.substring(1), payload);
      }
    } else {
      // We intentionally do not handle HTML insertion here. If the target is
      // a DOM selector (e.g., '#error-dump') and the payload is HTML, the 
      // framework delegates the actual DOM manipulation to the DOM mutator, 
      // which listens for the 'rz:fetch:error:html' event fired by the engine.
    }
  }
}
