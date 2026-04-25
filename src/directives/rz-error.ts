import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import {
  getDefinedDirectiveValue,
  getDirectiveValue,
  hasDirective,
  isJsonType,
  warn,
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
 * to the DOM Mutator or the Store Manager based on the target syntax.
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
      } else {
        warn(`Cannot route non-JSON error response to store '${targetStr}'.`);
      }
    } else {
      if (isJson) {
        warn(`Cannot route JSON error payload to DOM target '${targetStr}'.`);
      }
    }
  }
}
